import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { body } from 'express-validator';
import { DecryptionError, decryptField, encryptField, loadKeyring } from '../src/services/fieldEncryption.js';
import {
  accountLastFour,
  accountNumberHash,
  accountNumberMatches,
  displayStatus,
  employeeAccountContext,
  missingForSubmit,
  onboardingAccountContext,
  validateBankInput
} from '../src/services/bankDetailsRules.js';
import { maskLastFour } from '../src/utils/maskSensitive.js';
import { validate } from '../src/middleware/validate.js';
import { errorHandler } from '../src/middleware/errorHandler.js';

// Fictional values only.
const FAKE_ACCOUNT = '000011112222';
const FAKE_IFSC = 'ZZZZ0000001';

function testKeyring() {
  const key = () => crypto.randomBytes(32).toString('base64');
  return loadKeyring({
    FIELD_ENCRYPTION_KEYS: JSON.stringify({ test1: key() }),
    FIELD_ENCRYPTION_ACTIVE_KEY_ID: 'test1',
    BLIND_INDEX_KEY: key()
  });
}

const validInput = {
  accountHolderName: '  Test   Person ',
  bankName: 'Example Test Bank',
  accountNumber: '0000 1111 2222',
  confirmAccountNumber: '000011112222',
  ifscCode: 'zzzz0000001',
  accountType: 'savings',
  branchName: 'Sample Branch'
};

describe('bank details validation', () => {
  it('accepts and normalises a complete entry', () => {
    const { values, accountNumber, errors } = validateBankInput(validInput);
    assert.deepEqual(errors, {});
    assert.equal(accountNumber, FAKE_ACCOUNT);
    assert.equal(values.accountHolderName, 'Test Person');
    assert.equal(values.ifscCode, FAKE_IFSC);
    assert.equal(values.accountType, 'SAVINGS');
  });

  it('allows a draft with blank fields', () => {
    const { accountNumber, errors } = validateBankInput({ bankName: 'Example Test Bank' });
    assert.deepEqual(errors, {});
    assert.equal(accountNumber, null);
  });

  it('rejects mismatched confirmation without echoing either number', () => {
    const { accountNumber, errors } = validateBankInput({ ...validInput, confirmAccountNumber: '000011113333' });
    assert.equal(accountNumber, null);
    assert.match(errors.confirmAccountNumber, /do not match/);
    const text = JSON.stringify(errors);
    assert.ok(!text.includes('0000111') && !text.includes('2222') && !text.includes('3333'));
  });

  it('requires the confirmation when an account number is entered', () => {
    const { errors } = validateBankInput({ accountNumber: FAKE_ACCOUNT });
    assert.ok(errors.confirmAccountNumber);
  });

  it('rejects account numbers that are too short, too long or not numeric', () => {
    for (const bad of ['12345678', '1234567890123456789', '0000ABCD2222']) {
      const { errors } = validateBankInput({ accountNumber: bad, confirmAccountNumber: bad });
      assert.ok(errors.accountNumber, bad);
      assert.ok(!errors.accountNumber.includes(bad));
    }
  });

  it('rejects malformed IFSC codes and unknown account types', () => {
    assert.ok(validateBankInput({ ifscCode: 'ZZZZ1000001' }).errors.ifscCode);
    assert.ok(validateBankInput({ ifscCode: 'ZZZ0000001' }).errors.ifscCode);
    assert.ok(validateBankInput({ accountType: 'SALARY' }).errors.accountType);
  });

  it('rejects disallowed characters in names', () => {
    assert.ok(validateBankInput({ accountHolderName: 'Test <script>' }).errors.accountHolderName);
    assert.ok(validateBankInput({ bankName: 'Bank; DROP' }).errors.bankName);
  });

  it('lists what is missing before submission', () => {
    assert.deepEqual(missingForSubmit(null), [
      'Account holder name',
      'Bank name',
      'Account number',
      'IFSC code',
      'Account type',
      'Bank proof'
    ]);
    const complete = {
      account_holder_name: 'Test Person',
      bank_name: 'Example Test Bank',
      account_number_enc: 'v1:x',
      ifsc_code: FAKE_IFSC,
      account_type: 'SAVINGS',
      proof_id: 1
    };
    assert.deepEqual(missingForSubmit(complete), []);
    assert.deepEqual(missingForSubmit({ ...complete, proof_id: null }), ['Bank proof']);
  });
});

describe('bank details status and masking', () => {
  it('maps stored status to the four employee-facing statuses', () => {
    assert.equal(displayStatus(null), 'NOT_SUBMITTED');
    assert.equal(displayStatus({ status: 'DRAFT' }), 'NOT_SUBMITTED');
    assert.equal(displayStatus({ status: 'DRAFT' }, 'CORRECTION_REQUIRED'), 'CORRECTION_REQUIRED');
    assert.equal(displayStatus({ status: 'PENDING_VERIFICATION' }, 'CORRECTION_REQUIRED'), 'PENDING_VERIFICATION');
    assert.equal(displayStatus({ status: 'VERIFIED' }), 'VERIFIED');
    assert.equal(displayStatus({ status: 'CORRECTION_REQUIRED' }), 'CORRECTION_REQUIRED');
  });

  it('shows only the last four digits', () => {
    assert.equal(accountLastFour(FAKE_ACCOUNT), '2222');
    assert.equal(maskLastFour('2222'), 'XXXXXX2222');
    assert.equal(maskLastFour(null), null);
    assert.equal(maskLastFour('22A2'), null);
  });
});

describe('bank account encryption and matching', () => {
  it('matches the verifier entry against the keyed hash only', () => {
    const keyring = testKeyring();
    const hash = accountNumberHash(FAKE_ACCOUNT, keyring);
    assert.match(hash, /^[0-9a-f]{64}$/);
    assert.ok(!hash.includes(FAKE_ACCOUNT));
    assert.equal(accountNumberMatches('0000-1111-2222', hash, keyring), true);
    assert.equal(accountNumberMatches('000011112223', hash, keyring), false);
    assert.equal(accountNumberMatches('', hash, keyring), false);
    assert.equal(accountNumberMatches(FAKE_ACCOUNT, null, keyring), false);
    assert.equal(accountNumberMatches(FAKE_ACCOUNT, hash, testKeyring()), false);
  });

  it('binds ciphertext to the onboarding case or the employee record', () => {
    const keyring = testKeyring();
    const onboarding = encryptField(FAKE_ACCOUNT, { context: onboardingAccountContext(7), keyring });
    assert.ok(!onboarding.includes(FAKE_ACCOUNT));
    assert.equal(decryptField(onboarding, { context: onboardingAccountContext(7), keyring }), FAKE_ACCOUNT);
    assert.throws(() => decryptField(onboarding, { context: onboardingAccountContext(8), keyring }), DecryptionError);
    assert.throws(() => decryptField(onboarding, { context: employeeAccountContext(7), keyring }), DecryptionError);
  });
});

function fakeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

function captureConsole(fn) {
  const lines = [];
  const original = { error: console.error, warn: console.warn };
  console.error = (...args) => lines.push(args.map(String).join(' '));
  console.warn = (...args) => lines.push(args.map(String).join(' '));
  try {
    fn();
  } finally {
    console.error = original.error;
    console.warn = original.warn;
  }
  return lines.join('\n');
}

describe('error responses and logs never contain submitted values', () => {
  it('validate() leaves the submitted value out of error details', async () => {
    const req = { body: { accountNumber: FAKE_ACCOUNT } };
    await body('accountNumber').isEmail().run(req);
    let forwarded;
    validate(req, {}, (err) => {
      forwarded = err;
    });
    assert.equal(forwarded.statusCode, 422);
    assert.ok(!JSON.stringify(forwarded.details).includes(FAKE_ACCOUNT));
    assert.equal(forwarded.details[0].path, 'accountNumber');
  });

  it('errorHandler logs and returns database errors without SQL or values', () => {
    const dbError = Object.assign(new Error(`Incorrect integer value: '${FAKE_ACCOUNT}' for column 'x'`), {
      code: 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD',
      sqlMessage: `Incorrect integer value: '${FAKE_ACCOUNT}' for column 'x'`,
      sql: `UPDATE t SET x = '${FAKE_ACCOUNT}'`
    });
    const res = fakeRes();
    const req = { method: 'POST', originalUrl: '/api/onboarding/1/bank-details' };
    const logged = captureConsole(() => errorHandler(dbError, req, res, () => {}));
    assert.equal(res.statusCode, 500);
    assert.equal(res.body.message, 'An unexpected error occurred.');
    assert.ok(!JSON.stringify(res.body).includes(FAKE_ACCOUNT));
    assert.ok(!logged.includes('UPDATE t SET'));
    assert.ok(logged.includes('ER_TRUNCATED_WRONG_VALUE_FOR_FIELD'));
  });

  it('errorHandler redacts duplicate-entry values', () => {
    const dupError = Object.assign(new Error(`Duplicate entry '${FAKE_ACCOUNT}' for key 'uq'`), {
      code: 'ER_DUP_ENTRY',
      sqlMessage: `Duplicate entry '${FAKE_ACCOUNT}' for key 'uq'`,
      sql: 'INSERT ...'
    });
    const res = fakeRes();
    const logged = captureConsole(() =>
      errorHandler(dupError, { method: 'POST', originalUrl: '/api/x' }, res, () => {})
    );
    assert.equal(res.statusCode, 409);
    assert.ok(!logged.includes(FAKE_ACCOUNT));
    assert.ok(!JSON.stringify(res.body).includes(FAKE_ACCOUNT));
  });
});
