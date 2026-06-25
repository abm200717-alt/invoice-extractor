export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb',
    },
  },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'GEMINI_API_KEY no configurada. Ve a Vercel → Settings → Environment Variables.',
    });
  }

  try {
    const { files } = req.body;
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No se recibieron archivos.' });
    }

    const parts = [];

    for (const file of files) {
      parts.push({
        inline_data: {
          mime_type: 'application/pdf',
          data: file.data,
        },
      });
    }

    parts.push({
      text: `Eres un extractor de datos de facturas comerciales de SanDisk/Western Digital.

Analiza TODOS los PDFs adjuntos. Por cada línea de item en cada factura extrae:

- delivery_id: el campo "Delivery Number" de la factura
- part_number: "Item Part Number" exacto como aparece
- coo: "Country Of Origin" como código de 2 letras (MY, TH, CN, etc.)
- quantity: cantidad numérica
- unit_price: precio unitario con TODOS sus decimales tal como aparece (hasta 9 decimales, ej: 34.290000)
- extension: unit_price × quantity con todos sus decimales
- item_description: descripción completa del producto en una sola línea
- export_hts: código HTS de exportación (ej: 8523510000)
- us_eccn: clasificación ECCN (ej: EAR99)
- us_export_license: siempre "NLR"

REGLAS:
- Una fila por cada item/número de parte
- Si hay múltiples facturas incluye todas las filas ordenadas por delivery_id
- Preserva el unit_price exactamente como aparece en el PDF con todos sus decimales

Responde ÚNICAMENTE con JSON válido sin backticks ni markdown:
{"rows":[{"delivery_id":"","part_number":"","coo":"","quantity":1,"unit_price":"","extension":"","item_description":"","export_hts":"","us_eccn":"EAR99","us_export_license":"NLR"}]}`,
    });

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 4000,
          },
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      const msg = data.error?.message || JSON.stringify(data);
      return res.status(response.status).json({ error: 'Error de Gemini: ' + msg });
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
