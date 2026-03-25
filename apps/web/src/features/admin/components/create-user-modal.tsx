import { useState } from "react";
import { X } from "lucide-react";

const USER_ROLES = {
  ADMIN: "admin",
  CLINICIAN: "clinician",
  RECEPTIONIST: "receptionist",
  PATIENT: "patient"
} as const;

type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

interface Tenant {
  id: string;
  name: string;
}

interface CreateUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { email: string; password: string; role: string; tenantId: string }) => void;
  tenants: Tenant[];
}

export function CreateUserModal({ isOpen, onClose, onSubmit, tenants }: CreateUserModalProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>(USER_ROLES.PATIENT);
  const [tenantId, setTenantId] = useState("");

  if (!isOpen) {
    return null;
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    onSubmit({ email, password, role, tenantId });
    // Reset form
    setEmail("");
    setPassword("");
    setRole(USER_ROLES.PATIENT);
    setTenantId("");
  }

  function handleClose() {
    onClose();
    // Reset form
    setEmail("");
    setPassword("");
    setRole(USER_ROLES.PATIENT);
    setTenantId("");
  }

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal modal--create-user" onClick={(event) => event.stopPropagation()}>
        <div className="modal__header">
          <h2>Crear Nuevo Usuario</h2>
          <button
            aria-label="Cerrar modal"
            className="modal__close"
            onClick={handleClose}
            type="button"
          >
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="modal__body">
          <div className="form-group">
            <label htmlFor="create-user-email">Email</label>
            <input
              id="create-user-email"
              name="email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </div>
          <div className="form-group">
            <label htmlFor="create-user-password">Contraseña</label>
            <input
              id="create-user-password"
              minLength={8}
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Mínimo 8 caracteres"
              required
              type="password"
              value={password}
            />
          </div>
          <div className="form-group">
            <label htmlFor="create-user-role">Rol</label>
            <select
              id="create-user-role"
              name="role"
              onChange={(event) => setRole(event.target.value as UserRole)}
              value={role}
            >
              <option value={USER_ROLES.ADMIN}>Admin</option>
              <option value={USER_ROLES.CLINICIAN}>Clinician</option>
              <option value={USER_ROLES.RECEPTIONIST}>Receptionist</option>
              <option value={USER_ROLES.PATIENT}>Patient</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="create-user-tenant">Sede</label>
            <select
              id="create-user-tenant"
              name="tenantId"
              onChange={(event) => setTenantId(event.target.value)}
              required
              value={tenantId}
            >
              <option value="">Seleccionar sede...</option>
              {tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name}
                </option>
              ))}
            </select>
          </div>
          <div className="modal__footer">
            <button
              className="modal__button modal__button--secondary"
              onClick={handleClose}
              type="button"
            >
              Cancelar
            </button>
            <button className="modal__button modal__button--primary" type="submit">
              Crear Usuario
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
