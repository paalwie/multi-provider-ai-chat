# AI-Coach Backend System

Ein modulares Backend-System für KI-gestützte Coaching-Anwendungen, entwickelt als Teil eines FIAE (Fachinformatiker Anwendungsentwicklung) Abschlussprojekts.

## ⚠️ Projekthinweis

**Dies ist ein Teilprojekt!** Die hier bereitgestellten Dateien zeigen die KI-Integration und das Test-Frontend. Für einen vollständigen Betrieb werden zusätzliche Komponenten benötigt:

- Backend-Server (Express.js-Grundgerüst)
- Datenbankschema und Migrations-Skripte
- Authentifizierungs-Middleware
- Weitere API-Endpoints
- Konfigurationsdateien

Die vorliegenden Dateien demonstrieren die **Kernfunktionalität der KI-Integration** und können als Referenz für ähnliche Projekte dienen.

## 📋 Inhalt dieses Repositories

- `ai_router.js` - Express.js Router für KI-API-Integration (Gemini, OpenAI, DeepSeek)
- `index.html` - Test-Frontend für die KI-Chat-Funktionalität mit Markdown-Rendering

## 🎯 Projektübersicht

Das System ermöglicht die Integration verschiedener KI-Anbieter in eine Coaching-Plattform. Benutzer können mit unterschiedlichen KI-Modellen interagieren, wobei jeder "Coach" individuell konfiguriert werden kann.

### Hauptfunktionen

- **Multi-Provider-Support**: Integration von Google Gemini, OpenAI und DeepSeek
- **Kontextbasierte Chats**: Jeder Coach hat einen eigenen System-Prompt (Kontext)
- **Persistente Chat-Historie**: Speicherung aller Konversationen in MySQL-Datenbank
- **Dynamische Modellauswahl**: Abrufen und Auswählen verfügbarer Modelle vom jeweiligen Anbieter
- **Redo-Funktionalität**: Löschen und Wiederholen der letzten Interaktion
- **Markdown-Rendering**: Formatierte Darstellung von KI-Antworten (Tabellen, Listen, Code, etc.)

## 🛠️ Verwendete Technologien

### Backend (`ai_router.js`)
- **Node.js** & **Express.js** - Server-Framework
- **MySQL** (via `mysql2`) - Datenbankanbindung
- **Google Generative AI SDK** - Gemini API-Integration
- **OpenAI SDK** - OpenAI API-Integration
- **Custom API-Calls** - DeepSeek-Integration via Fetch

### Frontend (`index.html`)
- **Vanilla JavaScript** - Keine Frameworks
- **Fetch API** - HTTP-Requests an Backend
- **Marked.js** - Markdown-zu-HTML-Konvertierung
- **DOMPurify** - XSS-Schutz bei HTML-Rendering
- **CSS** - Responsive Chat-UI im Messenger-Stil

## 📊 Datenbankstruktur (Erforderlich)

Das System benötigt folgende Tabellen in einer MySQL-Datenbank:

### Tabelle: `coaching_prompts`
```sql
CREATE TABLE coaching_prompts (
    coaching_id INT PRIMARY KEY AUTO_INCREMENT,
    context_prompt TEXT NOT NULL,
    api_key VARCHAR(255) NOT NULL,
    model VARCHAR(100) NOT NULL,
    api_provider ENUM('gemini', 'openai', 'deepseek') DEFAULT 'gemini',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Tabelle: `chat_history`
```sql
CREATE TABLE chat_history (
    chat_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    coaching_id INT NOT NULL,
    role ENUM('user', 'model') NOT NULL,
    message_content TEXT NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (coaching_id) REFERENCES coaching_prompts(coaching_id)
);
```

### Tabelle: `users` (beispielhaft)
```sql
CREATE TABLE users (
    user_id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    -- Weitere Felder nach Bedarf
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 🚀 Installation & Konfiguration

### Voraussetzungen

- Node.js (v16 oder höher)
- MySQL-Datenbank
- API-Keys für mindestens einen der unterstützten Anbieter:
  - [Google Gemini API](https://ai.google.dev/)
  - [OpenAI API](https://platform.openai.com/)
  - [DeepSeek API](https://www.deepseek.com/)

### Schritte

1. **Repository klonen**
```bash
git clone [repository-url]
cd ai-coach-backend
```

2. **Dependencies installieren**
```bash
npm install express mysql2 @google/generative-ai openai
```

3. **Datenbank konfigurieren**

Erstellen Sie eine Datei `ai-db.js` im Root-Verzeichnis:

```javascript
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: 'localhost',
    user: 'your_db_user',
    password: 'your_db_password',
    database: 'your_database_name',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

module.exports = pool;
```

4. **Datenbank-Tabellen erstellen**

Führen Sie die SQL-Befehle aus dem Abschnitt "Datenbankstruktur" aus.

5. **Server-Grundgerüst erstellen**

Erstellen Sie eine `server.js`:

```javascript
const express = require('express');
const cors = require('cors');
const aiRouter = require('./ai_router');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// AI-Router einbinden
app.use('/api/ai', aiRouter);

app.listen(PORT, () => {
    console.log(`Server läuft auf http://localhost:${PORT}`);
});
```

6. **Server starten**
```bash
node server.js
```

7. **Test-Frontend öffnen**

Öffnen Sie `index.html` in einem Browser. Passen Sie die Backend-URL in der HTML-Datei an, falls erforderlich (Standard: `http://localhost:3000`).

## 📡 API-Endpoints

### GET `/api/ai/models`
Ruft verfügbare Modelle vom gewählten Anbieter ab.

**Query-Parameter:**
- `apiKey` - API-Schlüssel des Anbieters
- `provider` - `gemini`, `openai` oder `deepseek`

**Response:**
```json
{
  "models": ["gemini-pro", "gemini-pro-vision", ...]
}
```

### POST `/api/ai/prompt`
Sendet eine Nachricht an die KI.

**Body:**
```json
{
  "prompt": "Benutzer-Nachricht",
  "userId": 1,
  "coachingId": 1,
  "apiProvider": "gemini",
  "baseUrl": "https://api.openai.com/v1" // Optional für OpenAI-kompatible APIs
}
```

**Response:**
```json
{
  "aiResponse": "KI-Antwort als Text"
}
```

### GET `/api/ai/history`
Lädt die Chat-Historie.

**Query-Parameter:**
- `userId` - Benutzer-ID
- `coachingId` - (Optional) Coach-ID für gefilterte Historie

**Response:**
```json
{
  "history": [
    {
      "role": "user",
      "message": "Hallo"
    },
    {
      "role": "model",
      "message": "Hallo! Wie kann ich helfen?"
    }
  ]
}
```

### POST `/api/ai/history/delete_last`
Löscht die letzten beiden Nachrichten (User + KI).

**Body:**
```json
{
  "userId": 1,
  "coachingId": 1
}
```

### POST `/api/ai/coach/settings`
Aktualisiert Coach-Einstellungen.

**Body:**
```json
{
  "coachingId": 1,
  "contextPrompt": "Du bist ein hilfreicher Assistent...",
  "apiKey": "sk-...",
  "model": "gpt-4"
}
```

### GET `/api/ai/coach/settings/:coachingId`
Lädt Coach-Einstellungen.

**Response:**
```json
{
  "context_prompt": "Du bist ein...",
  "api_key": "sk-...",
  "model": "gpt-4"
}
```

## 💡 Verwendungsbeispiel

1. **Coach anlegen** (via Admin-Panel oder direkt in DB):
```sql
INSERT INTO coaching_prompts (context_prompt, api_key, model, api_provider)
VALUES ('Du bist ein freundlicher Karriere-Coach.', 'your-api-key', 'gemini-pro', 'gemini');
```

2. **Test-Frontend nutzen**:
   - Benutzer auswählen
   - Coach auswählen
   - Nachricht eingeben und senden
   - KI-Antwort wird formatiert angezeigt

3. **Chat-Historie** wird automatisch gespeichert und kann jederzeit abgerufen werden.

## 🔒 Sicherheitshinweise

⚠️ **Wichtig für Produktivumgebungen:**

- API-Keys niemals im Frontend oder in öffentlichen Repositories speichern
- Umgebungsvariablen für sensible Daten verwenden (`.env`-Datei)
- Input-Validierung und Sanitization implementieren
- Rate-Limiting für API-Endpoints einrichten
- HTTPS in Produktion verwenden
- CORS-Einstellungen restriktiv konfigurieren
- SQL-Injection-Schutz durch Prepared Statements (bereits implementiert)

## 🎨 Frontend-Features

Das Test-Frontend (`index.html`) bietet:

- **Markdown-Rendering**: Tabellen, Listen, Code-Blöcke, Fettdruck, etc.
- **Syntax-Highlighting**: Für Code-Snippets
- **Kopier-Funktion**: Für KI-Antworten
- **Redo-Button**: Letzte Antwort wiederholen
- **Admin-Bereich**: Coach-Verwaltung und Modellauswahl
- **Chat-Historie-Modal**: Gesamter Verlauf auf einen Blick
- **Responsive Design**: Messenger-ähnliche UI

## 🐛 Bekannte Einschränkungen

- DeepSeek-API-Endpoint ist beispielhaft und muss ggf. angepasst werden
- Keine Authentifizierung im Router implementiert (muss extern erfolgen)
- Keine Fehlerbehandlung für Netzwerk-Timeouts
- Maximale Token-Limits der APIs werden nicht geprüft

## 📚 Erweiterungsmöglichkeiten

- **Streaming-Antworten**: Server-Sent Events für Echtzeit-Streaming
- **Datei-Uploads**: Bilder und Dokumente an KI senden
- **Multi-Modal**: Vision-Modelle für Bildanalyse
- **Webhooks**: Benachrichtigungen bei neuen Nachrichten
- **Analytics**: Tracking von API-Kosten und Nutzung
- **Caching**: Redis für häufige Anfragen

## 🤝 Beitragen

Da dies ein Ausbildungsprojekt ist, sind Verbesserungsvorschläge und Code-Reviews willkommen!

## 📝 Lizenz

[Fügen Sie hier Ihre Lizenz ein]

## 👤 Autor

Entwickelt als Teil des FIAE-Abschlussprojekts

## 📞 Support

Bei Fragen zu diesem Projekt erstellen Sie bitte ein Issue im Repository.

---

**Hinweis**: Dies ist ein Teilprojekt eines größeren Systems. Die hier gezeigten Komponenten demonstrieren die KI-Integration und sind nicht als standalone-Lösung gedacht.
