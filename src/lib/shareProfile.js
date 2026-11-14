import { toast } from "sonner";
import { publicOrigin } from "./publicUrl";

// Session 43 (Ravi): "Share my profile" quick action. Opens the phone's share sheet with the
// public profile link; where there is none (desktop), copies the link.
export async function shareCreatorProfile(user) {
  const id = user?.user_id || user?.id;
  if (!id) { toast.error("Please log in again."); return; }
  const url = `${publicOrigin()}/creator/${encodeURIComponent(id)}`;
  const title = user?.name ? `${user.name} on Ybex` : "My Ybex profile";
  try {
    if (navigator.share) {
      await navigator.share({ title, text: "Check out my creator profile on Ybex", url });
      return;
    }
  } catch (e) {
    if (e?.name === "AbortError") return; // closed the share sheet
  }
  try {
    await navigator.clipboard.writeText(url);
    toast.success("Profile link copied");
  } catch {
    toast.message("Your profile link", { description: url });
  }
}
