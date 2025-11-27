import { supabase } from './supabaseClient.js';

export async function loadUser() {
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    window.location.href = "index.html";
    return;
  }

  // Fetch user profile data
  const { data: profile } = await supabase
    .from('profiles')
    .select('firstname')
    .eq('id', user.id)
    .single();

  // Display firstname if available, otherwise use email
  const displayName = profile?.firstname || user.email;
  document.getElementById("userName").textContent = displayName;

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
