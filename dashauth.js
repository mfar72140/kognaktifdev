import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

export const supabase = createClient(
  "https://ijugaqvsszticpzrznnb.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlqdWdhcXZzc3p0aWNwenJ6bm5iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc2MjIwMjksImV4cCI6MjA3MzE5ODAyOX0.kx29Dr1eAIKdeRwpH9VBYerKuHYWz2wIvNYc85ms5mY"
);

export async function loadUser() {
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    window.location.href = "index.html";
    return;
  }

  // Fetch user profile safely
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('firstname')
    .eq('id', user.id)
    .maybeSingle();   // prevent crash if no row

  // Choose display name
  const displayName =
    profile && profile.firstname && profile.firstname.trim() !== ""
      ? profile.firstname
      : user.email;

  const userNameElement = document.getElementById("userName");
  if (userNameElement) {
    userNameElement.textContent = displayName;
  }

  const userMenu = document.querySelector(".user-menu");
  const userName = userNameElement;

  // Only add listener if elements exist (avoid null)
  if (userMenu && userName) {
    userName.addEventListener("click", () => {
      userMenu.classList.toggle("active");
    });

    document.addEventListener("click", (e) => {
      if (!userMenu.contains(e.target) && e.target !== userName) {
        userMenu.classList.remove("active");
      }
    });
  }

  // Logout
  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await supabase.auth.signOut();
      localStorage.clear();
      window.location.href = "index.html";
    });
  }
}

