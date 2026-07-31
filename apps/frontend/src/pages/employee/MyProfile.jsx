import { useEffect, useState } from 'react';
import api from '../../services/api.js';
import { useAuth } from '../../context/AuthContext.jsx';

const initialProfile = {
  fullName: '',
  personalEmail: '',
  phone: '',
  alternatePhone: '',
  dateOfBirth: '',
  gender: '',
  bloodGroup: '',
  maritalStatus: '',
  workLocation: ''
};

const emptyAddress = {
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  postalCode: '',
  country: 'India'
};

const initialEmergencyContact = {
  contactName: '',
  relationship: '',
  phone: '',
  alternatePhone: ''
};

const initialPassword = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: ''
};

const formatDate = (value) => {
  if (!value) return '';
  return String(value).slice(0, 10);
};

const formatDisplayDate = (value) => {
  if (!value) return '-';

  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(new Date(value));
};

export default function MyProfile() {
 const { user, updateUser } = useAuth();

  const canChangePassword =
    user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';

  const [profile, setProfile] = useState(initialProfile);
  const [employee, setEmployee] = useState(null);
  const [currentAddress, setCurrentAddress] = useState(emptyAddress);
  const [permanentAddress, setPermanentAddress] = useState(emptyAddress);
  const [emergencyContact, setEmergencyContact] = useState(
    initialEmergencyContact
  );
  const [password, setPassword] = useState(initialPassword);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const showMessage = (text) => {
    setError('');
    setMessage(text);
  };

  const showError = (text) => {
    setMessage('');
    setError(text);
  };

  const loadProfile = async () => {
    try {
      setLoading(true);
      setError('');

      const response = await api.get('/profile/me');
      const data = response.data.data;

      setEmployee(data.employee);

      setProfile({
        fullName: data.employee?.full_name || '',
        personalEmail: data.employee?.personal_email || '',
        phone: data.employee?.phone || '',
        alternatePhone: data.employee?.alternate_phone || '',
        dateOfBirth: formatDate(data.employee?.date_of_birth),
        gender: data.employee?.gender || '',
        bloodGroup: data.employee?.blood_group || '',
        maritalStatus: data.employee?.marital_status || '',
        workLocation: data.employee?.work_location || ''
      });

      const current = data.addresses?.find(
        (item) => item.address_type === 'CURRENT'
      );

      const permanent = data.addresses?.find(
        (item) => item.address_type === 'PERMANENT'
      );

      if (current) {
        setCurrentAddress({
          addressLine1: current.address_line_1 || '',
          addressLine2: current.address_line_2 || '',
          city: current.city || '',
          state: current.state || '',
          postalCode: current.postal_code || '',
          country: current.country || 'India'
        });
      }

      if (permanent) {
        setPermanentAddress({
          addressLine1: permanent.address_line_1 || '',
          addressLine2: permanent.address_line_2 || '',
          city: permanent.city || '',
          state: permanent.state || '',
          postalCode: permanent.postal_code || '',
          country: permanent.country || 'India'
        });
      }

      const firstContact = data.emergencyContacts?.[0];

      if (firstContact) {
        setEmergencyContact({
          contactName: firstContact.contact_name || '',
          relationship: firstContact.relationship || '',
          phone: firstContact.phone || '',
          alternatePhone: firstContact.alternate_phone || ''
        });
      }
    } catch (err) {
      showError(err.response?.data?.message || 'Unable to load profile.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  const updateState = (setter) => (event) => {
    const { name, value } = event.target;
    setter((current) => ({ ...current, [name]: value }));
  };
const saveProfile = async (event) => {
  event.preventDefault();

  try {
    const response = await api.put('/profile/me', profile);

    showMessage(
      response.data.message || 'Profile updated successfully.'
    );

    updateUser({
      full_name: profile.fullName,
      name: profile.fullName,
      personal_email: profile.personalEmail
    });

    await loadProfile();
  } catch (err) {
    showError(
      err.response?.data?.message || 'Unable to update profile.'
    );
  }
};

  const saveAddress = async (event, addressType, address) => {
    event.preventDefault();

    try {
      const response = await api.put('/profile/address', {
        addressType,
        ...address
      });
      showMessage(response.data.message || 'Address saved successfully.');
    } catch (err) {
      showError(err.response?.data?.message || 'Unable to save address.');
    }
  };

  const saveEmergencyContact = async (event) => {
    event.preventDefault();

    try {
      const response = await api.put(
        '/profile/emergency-contact',
        emergencyContact
      );
      showMessage(
        response.data.message || 'Emergency contact saved successfully.'
      );
    } catch (err) {
      showError(
        err.response?.data?.message || 'Unable to save emergency contact.'
      );
    }
  };

  const changePassword = async (event) => {
    event.preventDefault();

    if (password.newPassword !== password.confirmPassword) {
      showError('New password and confirm password do not match.');
      return;
    }

    try {
      const response = await api.put('/profile/password', {
        currentPassword: password.currentPassword,
        newPassword: password.newPassword
      });
      showMessage(response.data.message || 'Password changed successfully.');
      setPassword(initialPassword);
    } catch (err) {
      showError(err.response?.data?.message || 'Unable to change password.');
    }
  };

  if (loading) {
    return <div className="card">Loading profile...</div>;
  }

  const InfoCard = ({ label, value }) => (
    <div className="profile-info-card">
      <div className="profile-info-label">{label}</div>
      <div className="profile-info-value">{value || '-'}</div>
    </div>
  );

  const AddressForm = ({
    title,
    description,
    address,
    onChange,
    addressType,
    buttonLabel
  }) => (
    <form
      className="profile-form-card"
      onSubmit={(event) => saveAddress(event, addressType, address)}
    >
      <div className="profile-section-heading">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>

      <div className="profile-form-grid">
        <label>
          <span>Address Line 1</span>
          <input
            type="text"
            name="addressLine1"
            value={address.addressLine1}
            onChange={onChange}
            placeholder="House number, street or area"
            required
          />
        </label>

        <label>
          <span>Address Line 2</span>
          <input
            type="text"
            name="addressLine2"
            value={address.addressLine2}
            onChange={onChange}
            placeholder="Landmark or locality"
          />
        </label>

        <label>
          <span>City</span>
          <input
            type="text"
            name="city"
            value={address.city}
            onChange={onChange}
            required
          />
        </label>

        <label>
          <span>State</span>
          <input
            type="text"
            name="state"
            value={address.state}
            onChange={onChange}
            required
          />
        </label>

        <label>
          <span>Postal Code</span>
          <input
            type="text"
            name="postalCode"
            value={address.postalCode}
            onChange={onChange}
            required
          />
        </label>

        <label>
          <span>Country</span>
          <input
            type="text"
            name="country"
            value={address.country}
            onChange={onChange}
          />
        </label>
      </div>

      <button type="submit" className="profile-primary-button">
        {buttonLabel}
      </button>
    </form>
  );

  return (
    <>
      <style>{`
        .profile-page-header {
          margin-bottom: 24px;
        }

        .profile-page-header h1 {
          margin-bottom: 6px;
        }

        .profile-info-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
          gap: 16px;
          margin-bottom: 24px;
        }

        .profile-info-card,
        .profile-form-card {
          background: #ffffff;
          border: 1px solid #e6ecf2;
          border-radius: 18px;
          box-shadow: 0 10px 28px rgba(15, 23, 42, 0.06);
        }

        .profile-info-card {
          min-height: 104px;
          padding: 20px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }

        .profile-info-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 14px 32px rgba(15, 23, 42, 0.09);
        }

        .profile-info-label {
          color: #64748b;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .profile-info-value {
          color: #0f172a;
          font-size: 18px;
          font-weight: 750;
          margin-top: 10px;
          overflow-wrap: anywhere;
        }

        .profile-forms-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 22px;
          align-items: start;
        }

        .profile-form-card {
          padding: 24px;
        }

        .profile-section-heading {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
          padding-bottom: 16px;
          margin-bottom: 18px;
          border-bottom: 1px solid #edf2f7;
        }

        .profile-section-heading h2 {
          margin: 0;
          color: #0f172a;
          font-size: 19px;
        }

        .profile-section-heading p {
          margin: 6px 0 0;
          color: #64748b;
          font-size: 13px;
          line-height: 1.55;
        }

        .profile-form-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
        }

        .profile-form-grid label {
          display: flex;
          flex-direction: column;
          gap: 7px;
          color: #334155;
          font-size: 13px;
          font-weight: 650;
        }

        .profile-form-grid input,
        .profile-form-grid select {
          width: 100%;
          min-height: 45px;
          border: 1px solid #cbd5e1;
          border-radius: 11px;
          background: #f8fafc;
          color: #0f172a;
          padding: 10px 12px;
          font: inherit;
          outline: none;
          transition: border-color 0.2s ease, box-shadow 0.2s ease,
            background 0.2s ease;
          box-sizing: border-box;
        }

        .profile-form-grid input::placeholder {
          color: #94a3b8;
        }

        .profile-form-grid input:focus,
        .profile-form-grid select:focus {
          border-color: #0f766e;
          background: #ffffff;
          box-shadow: 0 0 0 4px rgba(15, 118, 110, 0.11);
        }

        .profile-primary-button {
          margin-top: 20px;
          border: 0;
          border-radius: 11px;
          background: linear-gradient(135deg, #0f766e, #0d9488);
          color: #ffffff;
          min-height: 44px;
          padding: 10px 20px;
          font-size: 14px;
          font-weight: 750;
          cursor: pointer;
          box-shadow: 0 8px 18px rgba(15, 118, 110, 0.22);
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }

        .profile-primary-button:hover {
          transform: translateY(-1px);
          box-shadow: 0 11px 22px rgba(15, 118, 110, 0.28);
        }

        @media (max-width: 960px) {
          .profile-forms-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 640px) {
          .profile-form-card {
            padding: 18px;
          }

          .profile-form-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <div className="profile-page-header">
        <h1 className="page-title">My Profile</h1>
        <p className="page-subtitle">
          View and update your personal and employment details.
        </p>
      </div>

      {message && <div className="message message-success">{message}</div>}
      {error && <div className="message message-error">{error}</div>}

      <div className="profile-info-grid">
        <InfoCard label="Employee ID" value={employee?.employee_id} />
        <InfoCard label="Official Email" value={employee?.email} />
        <InfoCard label="Designation" value={employee?.designation} />
        <InfoCard label="Department" value={employee?.department} />
        <InfoCard label="Role" value={employee?.role} />
        <InfoCard label="Employment Status" value={employee?.status} />
        <InfoCard
          label="Date of Joining"
          value={formatDisplayDate(employee?.joining_date)}
        />
      </div>

      <div className="profile-forms-grid">
        <form className="profile-form-card" onSubmit={saveProfile}>
          <div className="profile-section-heading">
            <div>
              <h2>Personal Information</h2>
              <p>Update your personal contact and identity details.</p>
            </div>
          </div>

          <div className="profile-form-grid">
            <label>
              <span>Full Name</span>
              <input
                type="text"
                name="fullName"
                value={profile.fullName}
                onChange={updateState(setProfile)}
              />
            </label>

            <label>
              <span>Personal Email</span>
              <input
                type="email"
                name="personalEmail"
                value={profile.personalEmail}
                onChange={updateState(setProfile)}
              />
            </label>

            <label>
              <span>Phone Number</span>
              <input
                type="text"
                name="phone"
                value={profile.phone}
                onChange={updateState(setProfile)}
              />
            </label>

            <label>
              <span>Alternate Phone</span>
              <input
                type="text"
                name="alternatePhone"
                value={profile.alternatePhone}
                onChange={updateState(setProfile)}
              />
            </label>

            <label>
              <span>Date of Birth</span>
              <input
                type="date"
                name="dateOfBirth"
                value={profile.dateOfBirth}
                onChange={updateState(setProfile)}
              />
            </label>

            <label>
              <span>Gender</span>
              <select
                name="gender"
                value={profile.gender}
                onChange={updateState(setProfile)}
              >
                <option value="">Select gender</option>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="OTHER">Other</option>
              </select>
            </label>

            <label>
              <span>Blood Group</span>
              <input
                type="text"
                name="bloodGroup"
                value={profile.bloodGroup}
                onChange={updateState(setProfile)}
                placeholder="Example: O+"
              />
            </label>

            <label>
              <span>Marital Status</span>
              <select
                name="maritalStatus"
                value={profile.maritalStatus}
                onChange={updateState(setProfile)}
              >
                <option value="">Select status</option>
                <option value="SINGLE">Single</option>
                <option value="MARRIED">Married</option>
                <option value="DIVORCED">Divorced</option>
                <option value="WIDOWED">Widowed</option>
              </select>
            </label>

            <label>
              <span>Work Location</span>
              <input
                type="text"
                name="workLocation"
                value={profile.workLocation}
                onChange={updateState(setProfile)}
              />
            </label>
          </div>

          <button type="submit" className="profile-primary-button">
            Save Personal Details
          </button>
        </form>

        <AddressForm
          title="Current Address"
          description="Enter the address where you currently live."
          address={currentAddress}
          onChange={updateState(setCurrentAddress)}
          addressType="CURRENT"
          buttonLabel="Save Current Address"
        />

        <AddressForm
          title="Permanent Address"
          description="Enter your permanent residential address."
          address={permanentAddress}
          onChange={updateState(setPermanentAddress)}
          addressType="PERMANENT"
          buttonLabel="Save Permanent Address"
        />

        <form className="profile-form-card" onSubmit={saveEmergencyContact}>
          <div className="profile-section-heading">
            <div>
              <h2>Emergency Contact</h2>
              <p>Add the person to contact during an emergency.</p>
            </div>
          </div>

          <div className="profile-form-grid">
            <label>
              <span>Contact Name</span>
              <input
                type="text"
                name="contactName"
                value={emergencyContact.contactName}
                onChange={updateState(setEmergencyContact)}
                required
              />
            </label>

            <label>
              <span>Relationship</span>
              <input
                type="text"
                name="relationship"
                value={emergencyContact.relationship}
                onChange={updateState(setEmergencyContact)}
                placeholder="Example: Father, Mother, Spouse"
                required
              />
            </label>

            <label>
              <span>Phone Number</span>
              <input
                type="text"
                name="phone"
                value={emergencyContact.phone}
                onChange={updateState(setEmergencyContact)}
                required
              />
            </label>

            <label>
              <span>Alternate Phone</span>
              <input
                type="text"
                name="alternatePhone"
                value={emergencyContact.alternatePhone}
                onChange={updateState(setEmergencyContact)}
              />
            </label>
          </div>

          <button type="submit" className="profile-primary-button">
            Save Emergency Contact
          </button>
        </form>

        {canChangePassword && (
          <form className="profile-form-card" onSubmit={changePassword}>
            <div className="profile-section-heading">
              <div>
                <h2>Change Password</h2>
                <p>Available only to administrators.</p>
              </div>
            </div>

            <div className="profile-form-grid">
              <label>
                <span>Current Password</span>
                <input
                  type="password"
                  name="currentPassword"
                  value={password.currentPassword}
                  onChange={updateState(setPassword)}
                  required
                />
              </label>

              <label>
                <span>New Password</span>
                <input
                  type="password"
                  name="newPassword"
                  value={password.newPassword}
                  onChange={updateState(setPassword)}
                  minLength={8}
                  required
                />
              </label>

              <label>
                <span>Confirm New Password</span>
                <input
                  type="password"
                  name="confirmPassword"
                  value={password.confirmPassword}
                  onChange={updateState(setPassword)}
                  minLength={8}
                  required
                />
              </label>
            </div>

            <button type="submit" className="profile-primary-button">
              Change Password
            </button>
          </form>
        )}
      </div>
    </>
  );
}
