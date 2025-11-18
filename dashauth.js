import { supabase } from './supabaseClient.js';

export async function loadUser() {
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    window.location.href = "index.html";
    return;
  }

  document.getElementById("userName").textContent = user.email;

  const userMenu = document.querySelector(".user-menu");
  const userName = document.getElementById("userName");

  userName.addEventListener("click", () => {
    userMenu.classList.toggle("active");
  });

  document.addEventListener("click", (e) => {
    if (!userMenu.contains(e.target)) {
      userMenu.classList.remove("active");
    }
  });

  document.getElementById("logout-btn").addEventListener("click", async () => {
    await supabase.auth.signOut();
    localStorage.clear();
    window.location.href = "index.html";
  });
}
