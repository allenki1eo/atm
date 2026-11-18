import { redirect } from "next/navigation";

export default function NssfAttendanceRedirect() {
  redirect("/attendance/master-roll");
}
