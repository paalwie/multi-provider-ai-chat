const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { OpenAI } = require('openai');
const pool = require('../../ai-db');

// Hilfsfunktionen für die Datenbank-Interaktion
async function getCoachingPrompt(coachingId) {
    const [rows] = await pool.execute(
        'SELECT context_prompt, api_key, model, api_provider FROM coaching_prompts WHERE coaching_id = ?',
        [coachingId]
    );
    return rows[0] || null;
}

async function getChatHistory(userId, coachingId = null) {
    let sqlQuery = 'SELECT role, message_content FROM chat_history WHERE user_id = ?';
    let params = [userId];

    if (coachingId) {
        sqlQuery += ' AND coaching_id = ?';
        params.push(coachingId);
    }

    sqlQuery += ' ORDER BY timestamp ASC';

    const [rows] = await pool.execute(sqlQuery, params);
    return rows.map(row => ({
        role: row.role,
        message: row.message_content
    }));
}

async function saveMessage(userId, coachingId, role, message) {
    await pool.execute(
        'INSERT INTO chat_history (user_id, coaching_id, role, message_content) VALUES (?, ?, ?, ?)',
        [userId, coachingId, role, message]
    );
}

// Hilfsfunktion zum Löschen der letzten beiden Nachrichten
async function deleteLastMessages(userId, coachingId) {
    // KORREKTUR: Verwenden Sie den korrekten Spaltennamen 'chat_id'
    const ID_COLUMN = 'chat_id';
    let deletedCount = 0;

    // 1. Hole die ID der letzten KI-Nachricht (model)
    const [lastModelMessage] = await pool.execute(
        `SELECT ${ID_COLUMN} FROM chat_history WHERE user_id = ? AND coaching_id = ? AND role = "model" ORDER BY timestamp DESC LIMIT 1`,
        [userId, coachingId]
    );

    // 2. Hole die ID der letzten Benutzer-Nachricht (user)
    const [lastUserMessage] = await pool.execute(
        `SELECT ${ID_COLUMN} FROM chat_history WHERE user_id = ? AND coaching_id = ? AND role = "user" ORDER BY timestamp DESC LIMIT 1`,
        [userId, coachingId]
    );

    // 3. Überprüfen und Löschen der KI-Nachricht
    if (lastModelMessage.length > 0) {
        // KORREKTUR: Verwenden Sie lastModelMessage[0][ID_COLUMN] für den dynamischen Spaltennamen
        const modelId = lastModelMessage[0][ID_COLUMN];
        await pool.execute(`DELETE FROM chat_history WHERE ${ID_COLUMN} = ?`, [modelId]);
        deletedCount++;
    } else {
        console.log("Redo-Prozess: Letzte KI-Nachricht nicht gefunden.");
    }

    // 4. Überprüfen und Löschen der Benutzer-Nachricht
    if (lastUserMessage.length > 0) {
        const userIdToDelete = lastUserMessage[0][ID_COLUMN];
        await pool.execute(`DELETE FROM chat_history WHERE ${ID_COLUMN} = ?`, [userIdToDelete]);
        deletedCount++;
    } else {
        console.log("Redo-Prozess: Letzte User-Nachricht nicht gefunden.");
    }

    // Wenn nur eine Nachricht gefunden wird, wird diese gelöscht, aber die Funktion gibt 0 oder 1 zurück.
    return { deleted: deletedCount };
}


// Endpunkt zum Abrufen aller verfügbaren KI-Modelle (V2-API)
// NEU: Endpunkt zum Abrufen aller verfügbaren KI-Modelle (direkter API-Aufruf)
router.get("/models", async (req, res) => {
    const { apiKey, provider } = req.query;

    if (!apiKey) {
        return res.status(400).json({ error: "API-Schlüssel fehlt." });
    }

    if (!provider) {
        return res.status(400).json({ error: "Anbieter fehlt." });
    }

    try {
        let url;
        let models;

        switch (provider) {
            case "gemini":
                url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
                const geminiResponse = await fetch(url);
                if (!geminiResponse.ok) {
                    const geminiErrorText = await geminiResponse.text();
                    throw new Error(`Gemini-Fehler: ${geminiResponse.status} - ${geminiErrorText}`);
                }
                const geminiData = await geminiResponse.json();
                // Filtert Modelle ohne 'generateContent'-Unterstützung heraus
                models = geminiData.models
                    .filter(model => model.supportedGenerationMethods.includes('generateContent'))
                    .map(model => model.name);
                break;
            case "openai":
                url = "https://api.openai.com/v1/models";
                const openaiResponse = await fetch(url, {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                    },
                });
                if (!openaiResponse.ok) {
                    const openaiErrorText = await openaiResponse.text();
                    throw new Error(`OpenAI-Fehler: ${openaiResponse.status} - ${openaiErrorText}`);
                }
                const openaiData = await openaiResponse.json();
                models = openaiData.data.map(model => model.id);
                break;
            case "deepseek":
                // Beispiel-Endpunkt, muss möglicherweise angepasst werden
                url = "https://api.deepseek.com/models";
                const deepseekResponse = await fetch(url, {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                    },
                });
                if (!deepseekResponse.ok) {
                    const deepseekErrorText = await deepseekResponse.text();
                    throw new Error(`DeepSeek-Fehler: ${deepseekResponse.status} - ${deepseekErrorText}`);
                }
                const deepseekData = await deepseekResponse.json();
                models = deepseekData.data.map(model => model.id);
                break;
            default:
                return res.status(400).json({ error: "Unbekannter Anbieter." });
        }

        res.json({ models });
    } catch (error) {
        console.error("Fehler beim Abrufen der Modelle:", error);
        res.status(500).json({ error: error.message });
    }
});


// Endpunkt zum Aktualisieren der Coach-Einstellungen
router.post("/coach/settings", async (req, res) => {
    const { coachingId, contextPrompt, apiKey, model } = req.body;

    if (!coachingId || !contextPrompt || !apiKey || !model) {
        return res.status(400).json({ error: "Alle Parameter sind erforderlich." });
    }

    try {
        await pool.execute(
            'UPDATE coaching_prompts SET context_prompt = ?, api_key = ?, model = ? WHERE coaching_id = ?',
            [contextPrompt, apiKey, model, coachingId]
        );
        res.json({ message: "Einstellungen erfolgreich aktualisiert." });
    } catch (error) {
        console.error("Fehler beim Aktualisieren der Coach-Einstellungen:", error);
        res.status(500).json({ error: "Interner Serverfehler." });
    }
});

// Endpunkt zum Abrufen der Coach-Einstellungen
router.get("/coach/settings/:coachingId", async (req, res) => {
    const { coachingId } = req.params;

    try {
        const [rows] = await pool.execute(
            'SELECT context_prompt, api_key, model FROM coaching_prompts WHERE coaching_id = ?',
            [coachingId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: "Coach nicht gefunden." });
        }

        res.json(rows[0]);
    } catch (error) {
        console.error("Fehler beim Abrufen der Coach-Einstellungen:", error);
        res.status(500).json({ error: "Interner Serverfehler." });
    }
});

// Endpunkt zum Abrufen des Chatverlaufs
router.get("/history", async (req, res) => {
    const { userId, coachingId } = req.query;

    if (!userId) {
        return res.status(400).json({ error: "Fehlende User-ID." });
    }

    try {
        const history = await getChatHistory(userId, coachingId);
        res.json({ history });
    } catch (error) {
        console.error("Fehler beim Abrufen der Historie:", error);
        res.status(500).json({ error: "Interner Serverfehler." });
    }
});

// NEU: Endpunkt zum Löschen der letzten Nachrichten (User und Model)
router.post("/history/delete_last", async (req, res) => {
    const { userId, coachingId } = req.body;

    if (!userId || !coachingId) {
        return res.status(400).json({ error: "Fehlende Parameter (User-ID oder Coaching-ID)." });
    }

    try {
        const result = await deleteLastMessages(userId, coachingId);
        if (result.deleted < 2) {
            return res.status(404).json({ error: "Nicht genügend Nachrichten gefunden, um ein Paar zu löschen." });
        }
        res.json({ message: "Letzte User- und KI-Nachricht erfolgreich gelöscht." });
    } catch (error) {
        console.error("Fehler beim Löschen der letzten Historie:", error);
        res.status(500).json({ error: "Interner Serverfehler." });
    }
});

// Endpunkt für KI-Anfragen (mit V2-API)
// Endpunkt für KI-Anfragen
router.post("/prompt", async (req, res) => {
    // NEU: Wir erwarten, dass das Frontend (beim Speichern) die Base URL sendet, 
    // wenn es sich um einen temporären Test handelt.
    const { prompt: userPrompt, userId, coachingId, apiProvider, baseUrl } = req.body;

    if (!userPrompt || !userId || !coachingId) {
        return res.status(400).json({ error: "Fehlende Parameter." });
    }

    try {
        // Lade alle notwendigen Daten (inklusive des NEUEN Feldes 'api_provider')
        const coachingData = await getCoachingPrompt(coachingId);
        if (!coachingData) {
            return res.status(404).json({ error: "Coaching-Kontext nicht gefunden." });
        }

        // 1. Benutzer-Nachricht vor dem Senden speichern
        await saveMessage(userId, coachingId, 'user', userPrompt);

        // 2. Chat-Historie laden
        const history = await getChatHistory(userId, coachingId);

        let aiResponse = null;

        // --- Logik zur Auswahl des richtigen KI-Anbieters ---
        switch (coachingData.api_provider) {
            case 'openai':
                // A. Base URL bestimmen (temporäre Base URL aus dem Frontend ODER Standard)
                const openaiBaseUrl = "baseUrl || DEFAULT_OPENAI_BASE_URL;"

                // B. OpenAI Client initialisieren
                const openaiClient = new OpenAI({
                    apiKey: coachingData.api_key,
                    // NEU: Verwendung der dynamischen Base URL
                    baseURL: openaiBaseUrl
                });

                // C. Nachrichten für die OpenAI API vorbereiten
                let openaiMessages = [];

                // System-Prompt als erste Nachricht hinzufügen
                if (coachingData.context_prompt) {
                    openaiMessages.push({
                        role: "system",
                        content: coachingData.context_prompt
                    });
                }

                // Verlauf hinzufügen (OpenAI verwendet 'assistant' statt 'model')
                history.forEach(item => {
                    // WICHTIG: Die Rolle 'model' aus der DB wird zu 'assistant' für OpenAI
                    const role = item.role === 'user' ? 'user' : 'assistant';
                    openaiMessages.push({
                        role: role,
                        content: item.message
                    });
                });

                // Die aktuelle Benutzeranfrage hinzufügen
                openaiMessages.push({ role: "user", content: userPrompt });


                // D. Nachricht senden
                const openaiResult = await openaiClient.chat.completions.create({
                    model: coachingData.model,
                    messages: openaiMessages,
                    temperature: 0.7, // Optional: Fügen Sie konfigurierbare Parameter hinzu
                });

                // E. Antwort extrahieren
                aiResponse = openaiResult.choices[0]?.message?.content || null;

                break;

            case 'gemini':
            default:
                const genAI = new GoogleGenerativeAI(coachingData.api_key);
                const model = genAI.getGenerativeModel({ model: coachingData.model });

                const chat = model.startChat({
                    history: history.map(item => ({
                        role: item.role === 'user' ? 'user' : 'model',
                        parts: [{ text: item.message }]
                    })),
                    config: {
                        systemInstruction: coachingData.context_prompt,
                    }
                });

                const result = await chat.sendMessage([{ text: userPrompt }]);
                aiResponse = result.response.text();
                break;
        }


        // 3. Antwort prüfen und speichern
        if (!aiResponse) {
            // Wenn das Löschen der letzten Nachricht hier notwendig ist, müsste es hier passieren.
            console.warn("KI hat keine Textantwort geliefert.");
            await saveMessage(userId, coachingId, 'model', "Entschuldigung, ich konnte keine Antwort generieren.");
            return res.status(500).json({ error: "KI hat keine Textantwort geliefert." });
        }

        // 4. Die KI-Antwort speichern
        await saveMessage(userId, coachingId, 'model', aiResponse);

        res.json({ aiResponse });

    } catch (error) {
        console.error("Fehler beim Senden der KI-Anfrage:", error);
        // Fehlerdetails im Frontend anzeigen
        res.status(500).json({ error: `Interner Serverfehler: ${error.message}` });
    }
});

module.exports = router;