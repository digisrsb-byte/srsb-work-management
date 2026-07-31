import { Router } from 'express';
import { body } from 'express-validator';

import {
  listClients,
  getClientById,
  createClient,
  updateClient,
  deleteClient
} from '../controllers/clientController.js';

import {
  authenticate,
  allowRoles
} from '../middleware/auth.js';

import { validate } from '../middleware/validate.js';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  allowRoles(
    'SUPER_ADMIN',
    'ADMIN',
    'HR',
    'MANAGER',
    'RECRUITER'
  ),
  listClients
);

router.get(
  '/:id',
  allowRoles(
    'SUPER_ADMIN',
    'ADMIN',
    'HR',
    'MANAGER',
    'RECRUITER'
  ),
  getClientById
);

router.post(
  '/',
  allowRoles(
    'SUPER_ADMIN',
    'ADMIN',
    'HR',
    'MANAGER'
  ),
  [
    body('companyName')
      .trim()
      .notEmpty()
      .withMessage('Company name is required.'),
    validate
  ],
  createClient
);

router.put(
  '/:id',
  allowRoles(
    'SUPER_ADMIN',
    'ADMIN',
    'HR',
    'MANAGER'
  ),
  updateClient
);

router.delete(
  '/:id',
  allowRoles(
    'SUPER_ADMIN',
    'ADMIN'
  ),
  deleteClient
);

export default router;