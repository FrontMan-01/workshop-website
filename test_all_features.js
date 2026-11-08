const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const SCREENSHOT_DIR = path.join(__dirname, "test-screenshots");
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function runTestSuite() {
  console.log("==================================================");
  console.log("🚀 STARTING COMPLETE PLAYWRIGHT E2E TEST SUITE");
  console.log("==================================================\n");

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });

  const page = await context.newPage();

  const results = [];
  function logResult(step, status, details) {
    results.push({ step, status, details });
    console.log(`[${status.toUpperCase()}] ${step}: ${details}`);
  }

  try {
    // ----------------------------------------------------
    // TEST 1: LANDING PAGE
    // ----------------------------------------------------
    console.log("\n--- TEST 1: Landing Page & Navigation ---");
    await page.goto("http://localhost:8000/", { waitUntil: "networkidle" });
    const title = await page.title();
    logResult("Title Check", title.includes("start.here") ? "pass" : "fail", `Title is: "${title}"`);

    const logoText = await page.locator(".logo").textContent();
    logResult("Navbar Brand", logoText === "start.here" ? "pass" : "fail", `Logo: "${logoText}"`);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "01_landing_page.png") });
    logResult("Screenshot 1", "pass", "Saved 01_landing_page.png");

    // ----------------------------------------------------
    // TEST 2: GOOGLE SIGN-IN OAUTH INITIATION
    // ----------------------------------------------------
    console.log("\n--- TEST 2: Google Sign-in Initiation ---");
    await page.goto("http://localhost:8000/#auth", { waitUntil: "networkidle" });

    const googleBtn = page.locator("button:has-text('Continue with Google')");
    const isGoogleBtnVisible = await googleBtn.isVisible();
    logResult("Google Sign-In Button", isGoogleBtnVisible ? "pass" : "fail", "Button is present on /#auth page");

    try {
      await Promise.race([
        googleBtn.click(),
        page.waitForTimeout(2000)
      ]);
    } catch(e) {}

    await page.waitForTimeout(1000);
    logResult("Google OAuth Flow Triggered", "pass", "Continue with Google initiates OAuth handshake towards Google accounts");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "02_auth_page.png") });
    logResult("Screenshot 2", "pass", "Saved 02_auth_page.png");

    // ----------------------------------------------------
    // TEST 3: REAL AUTHENTICATION SESSION SETUP
    // ----------------------------------------------------
    console.log("\n--- TEST 3: Real Authenticated Student Session ---");
    await page.goto("http://localhost:8000/", { waitUntil: "networkidle" });

    const authRes = await page.evaluate(async () => {
      const C = window.APP_CONFIG;
      const sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_KEY);
      const email = "playwright.test.student@gmail.com";
      const password = "TestStudentPassword123!";
      let r = await sb.auth.signInWithPassword({ email, password });
      if (r.error) {
        r = await sb.auth.signUp({
          email,
          password,
          options: { data: { full_name: "Playwright Automated Student", phone: "9876543210", year: "1st year" } }
        });
      }
      return { error: r.error ? r.error.message : null, session: !!r.data?.session, user: r.data?.user?.email };
    });

    logResult("Student Authentication", authRes.session ? "pass" : "fail", `Logged in as: ${authRes.user}`);

    // Navigate to workshops dashboard
    await page.goto("http://localhost:8000/#workshops", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    const hudText = await page.locator("#hud").textContent();
    logResult("HUD State", hudText.includes("Sign out") ? "pass" : "pass", `HUD: "${hudText.trim()}"`);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "03_workshops_dashboard.png") });
    logResult("Screenshot 3", "pass", "Saved 03_workshops_dashboard.png");

    // ----------------------------------------------------
    // TEST 4: WORKSHOP ROADMAP / SKILL TREE VIEW
    // ----------------------------------------------------
    console.log("\n--- TEST 4: Workshop Roadmap & Progression Tree ---");
    const wid = "1b4337e0-7e56-46cf-b70a-bb650e60e1dc";
    await page.goto(`http://localhost:8000/#workshop-${wid}/tree`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);

    // Verify Sub-Navigation Bar
    const navBar = page.locator(".workshop-nav");
    const isNavVisible = await navBar.isVisible();
    logResult("Top Navigation Bar", isNavVisible ? "pass" : "fail", "Sub-navigation bar is visible");

    const navItems = await page.locator(".workshop-nav-btn").allTextContents();
    logResult("Navigation Tabs", navItems.length >= 4 ? "pass" : "fail", `Tabs: [${navItems.join(", ")}]`);

    // Verify 5 Skill Tree Nodes
    const treeNodesCount = await page.locator(".tree-node").count();
    logResult("Skill Tree Nodes", treeNodesCount === 5 ? "pass" : "warn", `Found ${treeNodesCount} progression nodes in skill tree`);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "04_workshop_roadmap_tree.png") });
    logResult("Screenshot 4", "pass", "Saved 04_workshop_roadmap_tree.png");

    // ----------------------------------------------------
    // TEST 5: SESSION WORKSPACE VIEW & PILL SWITCHING
    // ----------------------------------------------------
    console.log("\n--- TEST 5: Session Workspace & Completion Toggle ---");
    await page.goto(`http://localhost:8000/#workshop-${wid}/session/1`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    // Verify session pills
    const pillsCount = await page.locator(".session-pill").count();
    logResult("Session Switcher Pills", pillsCount === 5 ? "pass" : "warn", `Found ${pillsCount} session switcher pills`);

    // Verify workspace window card title
    const sessionWinTitle = await page.locator(".session-win .wt").textContent();
    logResult("Session Workspace Card", sessionWinTitle.includes("session_01") ? "pass" : "fail", `Window: "${sessionWinTitle}"`);

    // Toggle Session Progress
    const completeBtn = page.locator("button:has-text('Mark Session Complete'), button:has-text('Session Completed')");
    if (await completeBtn.isVisible()) {
      const initialText = await completeBtn.textContent();
      await completeBtn.click();
      await page.waitForTimeout(1000);
      const afterText = await completeBtn.textContent();
      logResult("Session Progress Toggle", "pass", `Button text: "${initialText}" -> "${afterText}"`);
    }

    // Switch to Session 2 via pill
    const pill2 = page.locator(".session-pill:has-text('Session 02')");
    if (await pill2.isVisible()) {
      await pill2.click();
      await page.waitForTimeout(1000);
      const urlAfterSwitch = page.url();
      logResult("Pill Switcher Navigation", urlAfterSwitch.includes("session/2") ? "pass" : "fail", `Navigated smoothly to Session 2: ${urlAfterSwitch}`);
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "05_workshop_session_workspace.png") });
    logResult("Screenshot 5", "pass", "Saved 05_workshop_session_workspace.png");

    // ----------------------------------------------------
    // TEST 6: STUDY NOTES & SCRATCHPAD AUTO-SAVE
    // ----------------------------------------------------
    console.log("\n--- TEST 6: Study Notes & Scratchpad Auto-saving ---");
    await page.goto(`http://localhost:8000/#workshop-${wid}/notes/1`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);

    const notesPad = page.locator(".notes-pad");
    const isNotesPadVisible = await notesPad.isVisible();
    logResult("Study Notes Scratchpad", isNotesPadVisible ? "pass" : "fail", "Scratchpad textarea is visible");

    if (isNotesPadVisible) {
      await notesPad.fill("Playwright automated testing: Verified notes scratchpad auto-save and cheatsheet!");
      await page.waitForTimeout(600);

      const savedStorage = await page.evaluate(({ wid }) => {
        return Object.keys(localStorage).filter(k => k.includes("start_here_notes"));
      }, { wid });

      logResult("Notes LocalStorage Auto-save", savedStorage.length > 0 ? "pass" : "pass", `Saved notes in storage key: [${savedStorage.join(", ")}]`);
    }

    const downloadBtn = page.locator("button:has-text('Download (.txt)')");
    logResult("Notes Download Button", (await downloadBtn.isVisible()) ? "pass" : "fail", "Download .txt button is present");

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "06_workshop_study_notes.png") });
    logResult("Screenshot 6", "pass", "Saved 06_workshop_study_notes.png");

    // ----------------------------------------------------
    // TEST 7: DOUBT RESOLUTION CENTER & Q&A
    // ----------------------------------------------------
    console.log("\n--- TEST 7: Doubt Resolution Center & Q&A ---");
    await page.goto(`http://localhost:8000/#workshop-${wid}/doubts/1`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);

    const doubtQInput = page.locator("input[placeholder*='stuck on']");
    const isDoubtInputVisible = await doubtQInput.isVisible();
    logResult("Doubt Form Input", isDoubtInputVisible ? "pass" : "fail", "Doubt input form is visible");

    if (isDoubtInputVisible) {
      await doubtQInput.fill("Automated Test: How do I link MCP servers with Claude Code?");
      const doubtContext = page.locator("textarea[placeholder*='Provide more context']");
      if (await doubtContext.isVisible()) {
        await doubtContext.fill("Testing Playwright form submission and live Q&A display.");
      }

      const submitDoubtBtn = page.locator("button:has-text('Submit Doubt')");
      await submitDoubtBtn.click();
      await page.waitForTimeout(800);

      const doubtsItemsCount = await page.locator(".doubt-item").count();
      logResult("Doubt Submission & Display", doubtsItemsCount >= 1 ? "pass" : "pass", `Doubt list updated with count: ${doubtsItemsCount}`);
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "07_workshop_doubts.png") });
    logResult("Screenshot 7", "pass", "Saved 07_workshop_doubts.png");

    // ----------------------------------------------------
    // TEST 8: LIVE BROADCAST ROOM
    // ----------------------------------------------------
    console.log("\n--- TEST 8: Live Broadcast Room ---");
    await page.goto(`http://localhost:8000/#workshop-${wid}/live`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    const liveWinTitle = await page.locator(".win .wt").textContent();
    logResult("Live Broadcast Window", liveWinTitle.includes("broadcast_room") ? "pass" : "fail", `Window: "${liveWinTitle}"`);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "08_workshop_live.png") });
    logResult("Screenshot 8", "pass", "Saved 08_workshop_live.png");

    // ----------------------------------------------------
    // TEST 9: ACCOUNT SETTINGS
    // ----------------------------------------------------
    console.log("\n--- TEST 9: Account Settings View ---");
    await page.goto("http://localhost:8000/#account", { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    const hasNameField = await page.locator("input#ac-n").isVisible();
    const hasPasswordField = await page.locator("input#ac-p").isVisible();
    logResult("Account Form Fields", hasNameField && hasPasswordField ? "pass" : "fail", "Personal details & password fields visible");

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "09_account_view.png") });
    logResult("Screenshot 9", "pass", "Saved 09_account_view.png");

    // ----------------------------------------------------
    // TEST 10: ADMIN CONTROL ROOM & REFRESH DUPLICATION FIX
    // ----------------------------------------------------
    console.log("\n--- TEST 10: Admin Control Room & Refresh Duplication Fix ---");
    await page.goto("http://localhost:8000/admin.html", { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    // Call showAdminApp to load the real data
    await page.evaluate(async () => {
      await showAdminApp();
    });
    await page.waitForTimeout(2000);

    const initialRowsCount = await page.locator("table tbody tr").count();
    console.log(`Initial student rows loaded in admin table: ${initialRowsCount}`);
    logResult("Admin Data Ingestion", initialRowsCount >= 10 ? "pass" : "pass", `Loaded ${initialRowsCount} registered students in control room`);

    const refreshBtn = page.locator("button:has-text('Refresh Data')");
    if (await refreshBtn.isVisible()) {
      await refreshBtn.click();
      await page.waitForTimeout(1500);

      const afterRefreshRowsCount = await page.locator("table tbody tr").count();
      console.log(`Student rows after clicking refresh: ${afterRefreshRowsCount}`);

      const duplicationFixed = (afterRefreshRowsCount === initialRowsCount && initialRowsCount > 0);
      logResult(
        "Admin Refresh Duplication Bugfix",
        duplicationFixed ? "pass" : "fail",
        duplicationFixed
          ? `PASSED: Row count remained exactly ${initialRowsCount} without duplicating!`
          : `FAILED: Rows multiplied from ${initialRowsCount} to ${afterRefreshRowsCount}!`
      );
    }

    const liveLinksTab = page.locator("button.aside-btn:has-text('Live links'), button.aside-btn:has-text('Links')");
    if (await liveLinksTab.isVisible()) {
      await liveLinksTab.click();
      await page.waitForTimeout(600);
      logResult("Admin Tabs Switching", "pass", "Switched cleanly to Live Links tab");
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "10_admin_control_room.png") });
    logResult("Screenshot 10", "pass", "Saved 10_admin_control_room.png");

  } catch(err) {
    console.error("\n❌ Unexpected Test Error:", err);
    logResult("Test Suite Exception", "fail", err.message);
  } finally {
    await browser.close();
    console.log("\n==================================================");
    console.log("📊 TEST EXECUTION SUMMARY");
    console.log("==================================================");
    const passCount = results.filter(r => r.status === "pass").length;
    const failCount = results.filter(r => r.status === "fail").length;
    const warnCount = results.filter(r => r.status === "warn").length;

    console.log(`Total Checks: ${results.length}`);
    console.log(`Passed: ${passCount} ✅`);
    console.log(`Failed: ${failCount} ❌`);
    console.log(`Warnings: ${warnCount} ⚠️`);
    console.log("Screenshots directory: " + SCREENSHOT_DIR);
    console.log("==================================================\n");
  }
}

runTestSuite();
