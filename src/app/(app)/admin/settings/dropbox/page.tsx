import { redirect } from "next/navigation";

export default function AdminDropboxSettingsRedirect() {
  redirect("/admin/settings/storage");
}
