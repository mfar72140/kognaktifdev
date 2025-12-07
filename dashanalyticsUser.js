// dashanalyticsUser.js
import { supabase } from './supabaseClient.js';

export async function loadUser() {
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    window.location.href = "index.html";
    return;
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('firstname')
    .eq('id', user.id)
    .maybeSingle();

  const displayName = profile?.firstname?.trim() ? profile.firstname : user.email;
  const userNameElement = document.getElementById("userName");
  if (userNameElement) userNameElement.textContent = displayName;

  const userMenu = document.querySelector(".user-menu");
  if (userMenu && userNameElement) {
    userNameElement.addEventListener("click", () => {
      userMenu.classList.toggle("active");
    });
    document.addEventListener("click", (e) => {
      if (!userMenu.contains(e.target) && e.target !== userNameElement) {
        userMenu.classList.remove("active");
      }
    });
  }

  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await supabase.auth.signOut();
      localStorage.clear();
      window.location.href = "index.html";
    });
  }
}
