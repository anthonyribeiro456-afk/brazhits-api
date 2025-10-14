import crypto from "crypto";
import fetch from "node-fetch";
import admin from "firebase-admin";

const app = admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  }),
});

const auth = admin.auth();
const db = admin.firestore();

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  const body = req.body;
  const event = body?.event;
  const email = body?.data?.customer?.email;
  const name = body?.data?.customer?.name || "Cliente BrazHits";

  if (event !== "purchase_approved") return res.status(200).json({ msg: "Evento ignorado" });
  if (!email) return res.status(400).json({ error: "Email ausente" });

  try {
    // verifica se já existe
    let existing = null;
    try {
      existing = await auth.getUserByEmail(email);
    } catch {}

    if (existing) return res.status(200).json({ msg: "Usuário já existe" });

    const randomPassword = crypto.randomBytes(6).toString("base64").slice(0, 10);

    const user = await auth.createUser({
      email,
      password: randomPassword,
      displayName: name,
      emailVerified: true,
    });

    await db.collection("users").doc(user.uid).set({
      email,
      name,
      createdAt: Date.now(),
      origin: "vega-checkout",
    });

    // Envio de e-mail automático
    await fetch(process.env.MAIL_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: email,
        subject: "Seus dados de acesso - Packs BrazHits 🎵",
        html: `
          <h2>Olá ${name.split(" ")[0]}!</h2>
          <p>Seu acesso à <b>Área de Membros BrazHits</b> foi liberado com sucesso.</p>
          <p><b>Email:</b> ${email}<br><b>Senha:</b> ${randomPassword}</p>
          <a href="https://brazhits.com.br/login" 
             style="display:inline-block;background:#00E4FF;color:#001A2A;
             padding:12px 24px;border-radius:8px;
             text-decoration:none;font-weight:bold;">
             Acessar Área de Membros
          </a>
        `,
      }),
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
