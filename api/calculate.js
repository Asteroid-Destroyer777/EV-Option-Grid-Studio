import { calculateRequest } from '../src/simulation/service.js';

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Используйте POST.' });
  try {
    const input = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (JSON.stringify(input).length > 250000) return res.status(413).json({ error: 'Запрос слишком большой.' });
    return res.status(200).json(calculateRequest(input));
  } catch (error) { return res.status(400).json({ error: error.message }); }
}
