import crypto from "crypto";
import admin from "firebase-admin";

// ✅ Inicializa o Firebase Admin apenas uma vez
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  });
}

const auth = admin.auth();
const db = admin.firestore();

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  try {
    const { event, data } = req.body || {};
    const email = data?.customer?.email;
    const name = data?.customer?.name || "Cliente BrazHits";

    // Apenas processa se for compra aprovada
    if (event !== "purchase_approved") {
      return res.status(200).json({ msg: "Evento ignorado" });
    }

    if (!email) {
      return res.status(400).json({ error: "Email ausente" });
    }

    // Verifica se o usuário já existe
    let existingUser = null;
    try {
      existingUser = await auth.getUserByEmail(email);
    } catch {
      // ignora erro se não existir
    }

    if (existingUser) {
      return res.status(200).json({ msg: "Usuário já existe" });
    }

    // Gera senha aleatória
    const randomPassword = crypto.randomBytes(6).toString("base64").slice(0, 10);

    // Cria usuário no Firebase Auth
    const user = await auth.createUser({
      email,
      password: randomPassword,
      displayName: name,
      emailVerified: true,
    });

    // Registra no Firestore
    await db.collection("users").doc(user.uid).set({
      email,
      name,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      origin: "vega-checkout",
    });

    // Envia o e-mail automático via Resend API (fetch nativo)
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "BrazHits <noreply@brazhits.com.br>",
        to: email,
        subject: "Seus dados de acesso - Packs BrazHits 🎵",
        html: `
          <h2>Olá ${name.split(" ")[0]}!</h2>
          <p>Seu acesso à <b>Área de Membros BrazHits</b> foi liberado com sucesso.</p>
          <p><b>Email:</b> ${email}<br><b>Senha:</b> ${randomPassword}</p>
          <a href="https://membros.brazhits.com.br/login" 
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
    console.error("Erro no auto-register:", err);
    return res.status(500).json({ error: err.message });
  }
}
