// Connects the platform dashboards to MeetSpace using the CURRENTLY logged-in person.
// Add to student-dashboard.html and mentor-dashboard.html:  <script src="meetspace-link.js"></script>
//
// How it works
//  1. Open:   reads the Supabase login that belongs to the person on this dashboard and hands it to
//             MeetSpace (in the URL hash, never to a server). MeetSpace clears any previous session first.
//  2. Logout: signOutMeetSpace() silently signs MeetSpace out too, so the next person never inherits it.
//
// Config: set window.MEETSPACE_URL before this script to override the default address.

const MEETSPACE_URL = window.MEETSPACE_URL || "http://localhost:8100";
const MEETSPACE_OWNER_KEY = "meetspace.owner";

// Every Supabase login saved in this browser (there can be more than one after testing).
function readSupabaseSessions() {
  const found = [];
  Object.keys(localStorage).forEach(function (key) {
    if (!/^sb-.*-auth-token$/.test(key)) return;
    try {
      const s = JSON.parse(localStorage.getItem(key));
      if (s && s.access_token && s.refresh_token) found.push(s);
    } catch (e) { /* ignore */ }
  });
  return found;
}

// Picks the login of the expected person. Without an expected email (mentor pages) the newest login is used.
function pickSession(sessions, expectedEmail) {
  if (expectedEmail) {
    const want = String(expectedEmail).toLowerCase();
    return sessions.find(function (s) {
      return String((s.user && s.user.email) || "").toLowerCase() === want;
    }) || null;
  }
  return sessions.slice().sort(function (a, b) { return (b.expires_at || 0) - (a.expires_at || 0); })[0] || null;
}

// path: "/dashboard" (Rooms) or "/chat" (Discussion + personal messages)
// loginPage: "auth.html" for students (default), "mentor-auth.html" for mentors
function openMeetSpace(path, loginPage) {
  loginPage = loginPage || "auth.html";
  const expectedEmail = String(window.currentUserEmail || "");
  const sessions = readSupabaseSessions();

  if (!sessions.length) {
    alert("Your login expired. Please log in again.");
    window.location.href = loginPage;
    return;
  }

  const s = pickSession(sessions, expectedEmail);
  if (!s) {
    alert(
      "No login for " + expectedEmail + " was found in this browser (another account logged in here later).\n\n" +
      "Log out and log in again. To use two accounts at the same time, use a separate browser or an incognito window for each."
    );
    return;
  }

  localStorage.setItem(MEETSPACE_OWNER_KEY, String((s.user && s.user.email) || "").toLowerCase());

  const url =
    MEETSPACE_URL + (path || "/dashboard") +
    "#access_token=" + encodeURIComponent(s.access_token) +
    "&refresh_token=" + encodeURIComponent(s.refresh_token) +
    "&uid=" + encodeURIComponent((s.user && s.user.id) || "") +
    "&login=" + encodeURIComponent(loginPage) +
    "&return=" + encodeURIComponent(window.location.href);
  window.open(url, "_blank");
}

// Signs MeetSpace out in this browser (hidden page, waits briefly). Safe to call when nothing is open.
function signOutMeetSpace() {
  return new Promise(function (resolve) {
    let done = false;
    const frame = document.createElement("iframe");
    frame.style.display = "none";
    function finish() {
      if (done) return;
      done = true;
      try { frame.remove(); } catch (e) { /* ignore */ }
      resolve();
    }
    frame.onload = function () { setTimeout(finish, 1500); };
    frame.src = MEETSPACE_URL + "/login#logout=1";
    document.body.appendChild(frame);
    setTimeout(finish, 3500);
  });
}

// Call once the dashboard knows who is logged in: if MeetSpace was last opened by someone else, sign that out.
function syncMeetSpaceOwner(email) {
  email = String(email || "").toLowerCase();
  if (!email) return;
  const previous = localStorage.getItem(MEETSPACE_OWNER_KEY);
  if (previous && previous !== email) {
    localStorage.removeItem(MEETSPACE_OWNER_KEY);
    signOutMeetSpace();
  }
}

// Call on platform logout: removes the saved Supabase login(s) from this browser.
function clearSupabaseSession() {
  Object.keys(localStorage).forEach(function (key) {
    if (/^sb-.*-auth-token/.test(key)) localStorage.removeItem(key);
  });
  localStorage.removeItem(MEETSPACE_OWNER_KEY);
}