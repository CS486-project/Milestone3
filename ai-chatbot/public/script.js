const inputField = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const messagesContainer = document.getElementById('messages');
const MAX_INTERACTIONS = 5;
let conversationHistory = [];

const fileInput = document.getElementById("file-input");

// Read the query string from the current page URL so we can extract values like participantID and systemID
const params = new URLSearchParams(window.location.search);

// Retrieve participantID and system ID from localStorage
const participantID = params.get('participantID') || localStorage.getItem('participantID');
const systemID = params.get('systemID');

// Prototype button and Task button
const prototypeBtn = document.getElementById('prototype-btn');
if (prototypeBtn) {
    prototypeBtn.addEventListener('click', () => {
        window.location.href = `/chat.html?participantID=${participantID}&systemID=${systemID}`;
    });
}

const taskBtn = document.getElementById('task-btn');
if (taskBtn) {
    taskBtn.addEventListener('click', () => {
        alert('Add your task instructions here or link this button to a task page.');
    });
}

// Alert and prompt if no participantID
if (!participantID) {
  alert('Please enter a participant ID.');
  // Redirect to login if no participantID is set
  window.location.href = '/';
}

async function sendMessage(inputElement) {
    const trimmedInput = inputElement.value.trim();
    if (trimmedInput === "") {
        alert("Please enter a message");
        return;
    }

    // Add user message to UI
    appendUserMessage(trimmedInput);
    inputElement.value = '';

    // Add to conversation history
    conversationHistory.push({ role: 'user', content: trimmedInput });

    // Get recent history (last N messages, where N = MAX_INTERACTIONS * 2 for user+bot pairs)
    const recentHistory = conversationHistory.slice(-MAX_INTERACTIONS * 2);

    // Get retrieval method
    const retrievalMethod = retrievalDropdown ? retrievalDropdown.value : 'semantic';

    try {
        const payload = {
            participantID: participantID,
            input: trimmedInput,
            history: recentHistory,
            systemID: parseInt(systemID) || 1,
            retrievalMethod: retrievalMethod
        };

        const response = await fetch('/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            appendBotMessage(data.botResponse, data.confidenceMetrics, data.retrievedDocuments);

            // Add bot response to conversation history
            conversationHistory.push({ role: 'assistant', content: data.botResponse });

        } catch (error) {
            console.error('Error sending message:', error);
            appendBotMessage('Error: Failed to get response from bot', null, null);
        }
    }

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text ?? '');
    return div.innerHTML;
}

function appendUserMessage(text) {
    const bubble = document.createElement('div');
    bubble.className = 'msg msg-user';
    bubble.textContent = text;
    messagesContainer.appendChild(bubble);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

let botMessageCounter = 0;

function appendBotMessage(text, confidenceMetrics, retrievedDocuments) {
    const bubbleId = `bot-msg-${++botMessageCounter}`;
    const bubble = document.createElement('div');
    bubble.className = 'msg msg-bot';
    bubble.id = bubbleId;

    const body = document.createElement('div');
    body.className = 'msg-text';
    body.innerHTML = renderTextWithCitationChips(text, bubbleId, (retrievedDocuments || []).length);
    bubble.appendChild(body);

    const meta = document.createElement('div');
    meta.className = 'msg-meta';

    if (confidenceMetrics) {
        const pct = confidenceMetrics.overallConfidence * 100;
        const chip = document.createElement('span');
        chip.className = 'confidence-chip ' + confidenceLevel(pct);
        chip.textContent = `${pct.toFixed(0)}% confidence · ${confidenceMetrics.retrievalMethod}`;
        meta.appendChild(chip);
    }

    if (retrievedDocuments && retrievedDocuments.length > 0) {
        const details = document.createElement('details');
        details.className = 'sources';
        details.id = `${bubbleId}-sources`;
        const summary = document.createElement('summary');
        summary.textContent = `View ${retrievedDocuments.length} source${retrievedDocuments.length === 1 ? '' : 's'}`;
        details.appendChild(summary);

        const list = document.createElement('ol');
        retrievedDocuments.forEach((doc, i) => {
            const score = (doc.relevanceScore ?? doc.score ?? 0);
            const preview = doc.chunkText.length > 240 ? doc.chunkText.substring(0, 240) + '…' : doc.chunkText;
            const li = document.createElement('li');
            li.id = `${bubbleId}-src-${i + 1}`;
            li.innerHTML = `<span class="src-doc">${escapeHtml(doc.documentName)}</span>
                            <span class="src-score">${(score * 100).toFixed(1)}% match</span>
                            <p class="src-preview">${escapeHtml(preview)}</p>`;
            list.appendChild(li);
        });
        details.appendChild(list);
        meta.appendChild(details);
    }

    if (meta.childNodes.length > 0) {
        bubble.appendChild(meta);
    }

    messagesContainer.appendChild(bubble);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function setupScratchpadNotes() {
    const notes = document.getElementById('scratchpad-notes');
    if (!notes) return;
    const notesKey = `scratchpad-notes-${participantID}`;
    notes.value = localStorage.getItem(notesKey) || '';
    notes.addEventListener('input', () => {
        localStorage.setItem(notesKey, notes.value);
    });
}

function renderTextWithCitationChips(text, bubbleId, sourceCount) {
    const escaped = escapeHtml(text);
    return escaped.replace(/\[Source\s+(\d+)\]/gi, (match, n) => {
        const idx = parseInt(n, 10);
        if (idx < 1 || idx > sourceCount) {
            return `<span class="cite-chip cite-chip-missing" title="Source ${idx} not in retrieved evidence">[${idx}]</span>`;
        }
        return `<a href="#${bubbleId}-src-${idx}" class="cite-chip" data-bubble="${bubbleId}" data-src="${idx}">[${idx}]</a>`;
    });
}

document.addEventListener('click', (e) => {
    const chip = e.target.closest('.cite-chip[data-bubble]');
    if (!chip) return;
    e.preventDefault();
    const bubbleId = chip.getAttribute('data-bubble');
    const srcIdx = chip.getAttribute('data-src');
    const details = document.getElementById(`${bubbleId}-sources`);
    const li = document.getElementById(`${bubbleId}-src-${srcIdx}`);
    if (details && !details.open) details.open = true;
    if (li) {
        li.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        li.classList.add('src-flash');
        setTimeout(() => li.classList.remove('src-flash'), 1500);
    }
});

function confidenceLevel(pct) {
    if (pct >= 60) return 'conf-high';
    if (pct >= 30) return 'conf-mid';
    return 'conf-low';
}

// Function to fetch and load existing conversation history
async function loadConversationHistory() {
    const response = await fetch('/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Send participantID to the server and maximum conversation exchanges
        body: JSON.stringify({ participantID, limit: MAX_INTERACTIONS })
    });
    const data = await response.json();

    if (data.interactions && data.interactions.length > 0) {
        data.interactions.forEach(interaction => {
            appendUserMessage(interaction.userInput);
            appendBotMessage(
                interaction.botResponse,
                interaction.confidenceMetrics,
                interaction.retrievedDocuments
            );

            // Add to conversation history
            conversationHistory.push({ role: 'user', content: interaction.userInput });
            conversationHistory.push({ role: 'assistant', content: interaction.botResponse });
        });
    }
}

function setupScratchpadToggle() {
    const scratchpad = document.getElementById('scratchpad');
    const toggle = document.getElementById('scratchpad-toggle');
    if (!scratchpad || !toggle) return;

    const collapseKey = `scratchpad-collapsed-${participantID}`;
    const wasCollapsed = localStorage.getItem(collapseKey) === '1';
    if (wasCollapsed) {
        scratchpad.classList.add('collapsed');
        toggle.textContent = '+';
        toggle.title = 'Expand';
    }

    toggle.addEventListener('click', () => {
        const nowCollapsed = scratchpad.classList.toggle('collapsed');
        toggle.textContent = nowCollapsed ? '+' : '−';
        toggle.title = nowCollapsed ? 'Expand' : 'Collapse';
        localStorage.setItem(collapseKey, nowCollapsed ? '1' : '0');
    });
}

// Load history and scratchpad when chat loads
window.onload = () => {
    loadConversationHistory();
    setupScratchpadNotes();
    setupScratchpadToggle();
};

const sendButton = document.getElementById("send-btn");
if (sendButton) {
    sendButton.addEventListener("click", (event) => {
        event.preventDefault();
        logEvent( 'click', 'Send Button');
        sendMessage(inputField);
    });
}

const inputElement = document.getElementById("user-input");
if (inputElement) {
    inputElement.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            sendMessage(inputElement);
        }
    });
}

const retrievalDropdown = document.querySelector("#retrieval-method select");

// Prevent form submit from reloading the page
const chatForm = document.querySelector('#chat-container form');
if (chatForm) {
    chatForm.addEventListener('submit', (event) => {
        event.preventDefault();
    });
}


if (retrievalDropdown) {
    retrievalDropdown.addEventListener("change", () => {
        console.log("Selected retrieval method: ", retrievalDropdown.value);
    });
}

// Log hover and focus events on the input field
const userInput = document.getElementById('user-input');
if (userInput) {
    userInput.addEventListener('mouseover', () => {
        logEvent('hover', 'User Input');
    });

    userInput.addEventListener('focus', () => {
        logEvent('focus', 'User Input');
    });
}

// Function to log events to the server
function logEvent(type, element) {
    fetch('/log-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantID: participantID, eventType: type, elementName: element, timestamp: new Date() })
    }).catch(error => {
        console.error('Error logging event:', error);
    });
}

const uploadBtn = document.getElementById("upload-btn");
if (uploadBtn) {
    uploadBtn.addEventListener("click", async (event) => {
    event.preventDefault();

    const fileInput = document.getElementById("file-input");
    const file = fileInput.files[0];

    if (!file) {
        alert("Choose a file first.");
        return;
    }
    console.log("Selected file: ", file.name);
  
    const formData = new FormData();
    formData.append("document", file);
  
    const response = await fetch("/upload-document", {
        method: "POST",
        body: formData
    });
  
    const data = await response.json();
    console.log(data);
    
    await loadDocuments();
    });
}

async function loadDocuments() {
    const documentsList = document.getElementById('documents-list');
    const placeholder = document.getElementById('uploaded-docs-placeholder');
    if (!documentsList || !placeholder) {
        return;
    }
    try {
        const response = await fetch("/documents");
        const docs = await response.json();
        console.log("Docs:", docs);
    
        const documentsList = document.getElementById("documents-list");
        documentsList.innerHTML = "";

        const placeholder = document.getElementById("uploaded-docs-placeholder");

        if (docs.length === 0) {
            placeholder.style.display = '';
            return;
        }
        placeholder.style.display = 'none';
    
        docs.forEach((doc) => {
            const li = document.createElement("li");
            li.textContent = `${doc.filename} - ${doc.processingStatus}`;
            documentsList.appendChild(li);
        });
    } catch (e) {
        console.error('loadDocuments:', e);
    }
}
loadDocuments();

// redirection to the qualtrics questionnaire
function redirectToQualtrics() {
    fetch('/redirect-to-survey', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participantID })
    })
      .then(response => response.text())
      .then(url => {
        logEvent('redirect', 'Qualtrics Survey');
        window.location.href = url;
      })
      .catch(error => {
        console.error('Error redirecting to survey:', error);
        alert('There was an error redirecting to the survey. Please try again.');
      });
  }

  // Connecting qualtrics to my button
  const surveyBtn = document.getElementById('survey-btn');
  if (surveyBtn) {
    surveyBtn.addEventListener('click', redirectToQualtrics);
  }
