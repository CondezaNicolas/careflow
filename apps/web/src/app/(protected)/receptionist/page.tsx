import { USER_ROLE } from "@/features/auth/auth.types";
import { RoleLandingPage } from "@/features/auth/components/role-landing-page";

export default function ReceptionistPage() {
  return (
    <RoleLandingPage
      description="Use this reception shell to validate check-in routing, auth guard behavior, and the shared logout path before the real desk workflows land."
      headline="Coordinate arrivals, bookings, and front-desk flow"
      highlights={[
        "Receptionist route ownership is enforced",
        "Protected layout shows the signed-in principal",
        "Role redirects stay deterministic across refreshes"
      ]}
      role={USER_ROLE.RECEPTIONIST}
    />
  );
}
