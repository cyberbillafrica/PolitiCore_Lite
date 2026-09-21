import { redirect } from "next/navigation";

export default function AdminBiographyRedirect() {
  redirect("/portal/admin/about");
}
