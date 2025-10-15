export default function handler(req, res) {
    if (req.method === "GET") {
      return res.status(200).json({ message: "API funcionando 🚀" });
    } else {
      return res.status(405).json({ error: "Method Not Allowed" });
    }
  }