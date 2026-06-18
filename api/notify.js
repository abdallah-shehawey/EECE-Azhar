/*
 * /api/notify — sends admin notification emails via Resend.
 * Two kinds of messages:
 *   { type: "contact",    name, email, message }      → a visitor complaint/message
 *   { type: "submission", name, kind }                → someone submitted/needs approval
 *
 * Requires env var RESEND_API_KEY (Vercel → Settings → Environment Variables).
 * Free Resend tier sends from onboarding@resend.dev to the account owner's email,
 * so ADMIN_EMAIL below must be the Gmail you signed up to Resend with.
 */

const ADMIN_EMAIL = "shehawey9@gmail.com";
const FROM = "EECE 2026 <onboarding@resend.dev>";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "RESEND_API_KEY not configured" });

  try {
    const { type, name, email, message, kind } = req.body || {};
    let subject, html, replyTo;

    if (type === "contact") {
      if (!message) return res.status(400).json({ error: "Missing message" });
      subject = `📬 New message from ${name || "a visitor"} — EECE 2026`;
      replyTo = email || undefined;
      html = `
        <h2>New contact message</h2>
        <p><strong>Name:</strong> ${esc(name) || "—"}</p>
        <p><strong>Email:</strong> ${esc(email) || "—"}</p>
        <p><strong>Message:</strong></p>
        <p style="white-space:pre-wrap">${esc(message)}</p>`;
    } else if (type === "submission") {
      subject = `🆕 New ${kind || "submission"} awaiting approval — EECE 2026`;
      html = `
        <h2>New submission needs your approval</h2>
        <p><strong>${esc(name) || "Someone"}</strong> submitted a ${esc(kind) || "profile"}.</p>
        <p>Open the site → account menu → <em>Approvals</em> to review it.</p>`;
    } else {
      return res.status(400).json({ error: "Unknown notification type" });
    }

    const payload = { from: FROM, to: [ADMIN_EMAIL], subject, html };
    if (replyTo) payload.reply_to = replyTo;

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(502).json({ error: data?.message || `Resend error ${r.status}` });
    res.status(200).json({ success: true, id: data.id });
  } catch (err) {
    console.error("notify error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
