import { Search } from "lucide-react";

interface SearchResults {
  users?: Array<{ id: string; email: string; role: string; rank: number }>;
  patients?: Array<{
    id: string;
    firstName: string;
    lastName: string;
    email?: string;
    rank: number;
  }>;
  appointments?: Array<{
    id: string;
    patientId: string;
    specialistId: string;
    rank: number;
  }>;
  logs?: Array<{ id: string; action: string; entityType: string; rank: number }>;
}

interface SearchResultsDropdownProps {
  loading: boolean;
  onSelect: (type: "user" | "patient" | "appointment" | "log", id: string) => void;
  results: SearchResults | undefined;
  visible: boolean;
}

export function SearchResultsDropdown({
  loading,
  onSelect,
  results,
  visible
}: SearchResultsDropdownProps) {
  if (!visible) {
    return null;
  }

  if (loading) {
    return (
      <div className="search-results-dropdown">
        <div className="search-results-dropdown__loading">
          <Search size={16} />
          <span>Buscando...</span>
        </div>
      </div>
    );
  }

  if (!results) {
    return null;
  }

  const hasResults =
    (results.users?.length ?? 0) +
      (results.patients?.length ?? 0) +
      (results.appointments?.length ?? 0) +
      (results.logs?.length ?? 0) >
    0;

  if (!hasResults) {
    return (
      <div className="search-results-dropdown">
        <div className="search-results-dropdown__empty">No se encontraron resultados</div>
      </div>
    );
  }

  return (
    <div className="search-results-dropdown">
      {results.users && results.users.length > 0 && (
        <div className="search-results-dropdown__section">
          <h4>Usuarios</h4>
          {results.users.map((user) => (
            <button
              key={user.id}
              className="search-results-dropdown__item"
              onClick={() => onSelect("user", user.id)}
              type="button"
            >
              {user.email} ({user.role})
            </button>
          ))}
        </div>
      )}

      {results.patients && results.patients.length > 0 && (
        <div className="search-results-dropdown__section">
          <h4>Pacientes</h4>
          {results.patients.map((patient) => (
            <button
              key={patient.id}
              className="search-results-dropdown__item"
              onClick={() => onSelect("patient", patient.id)}
              type="button"
            >
              {patient.firstName} {patient.lastName}
              {patient.email && ` (${patient.email})`}
            </button>
          ))}
        </div>
      )}

      {results.appointments && results.appointments.length > 0 && (
        <div className="search-results-dropdown__section">
          <h4>Turnos</h4>
          {results.appointments.map((appointment) => (
            <button
              key={appointment.id}
              className="search-results-dropdown__item"
              onClick={() => onSelect("appointment", appointment.id)}
              type="button"
            >
              Turno {appointment.id}
              <span className="search-results-dropdown__item-meta">
                Paciente: {appointment.patientId} | Especialista: {appointment.specialistId}
              </span>
            </button>
          ))}
        </div>
      )}

      {results.logs && results.logs.length > 0 && (
        <div className="search-results-dropdown__section">
          <h4>Logs</h4>
          {results.logs.map((log) => (
            <button
              key={log.id}
              className="search-results-dropdown__item"
              onClick={() => onSelect("log", log.id)}
              type="button"
            >
              {log.action} - {log.entityType}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
