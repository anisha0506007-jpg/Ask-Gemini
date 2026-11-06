const composer = document.getElementById("composer");
const questionInput = document.getElementById("question");
const sendButton = document.getElementById("sendButton");
const conversation = document.getElementById("conversation");
const messagesContainer = document.getElementById("messages");
const welcome = document.getElementById("welcome");
const newChatButtons = [
    document.getElementById("newChatButton"),
    document.getElementById("mobileNewChatButton")
];
const apiUrl = window.location.port === "5500" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname)
    ? `${window.location.protocol}//${window.location.hostname}:5000/ask`
    : "/ask";

let conversationHistory = [];
let isSending = false;

function scrollToLatest() {
    conversation.scrollTop = conversation.scrollHeight;
}

function createMessage(role, text, isError = false) {
    const message = document.createElement("article");
    message.className = `message ${role}${isError ? " error" : ""}`;

    if (role === "model") {
        const icon = document.createElement("div");
        icon.className = "assistant-mark";
        icon.setAttribute("aria-hidden", "true");
        icon.textContent = "✦";
        message.append(icon);
    }

    const content = document.createElement("div");
    content.className = "message-content";

    if (role === "model" && !isError) {
        const responseText = document.createElement("div");
        responseText.className = "message-text";
        responseText.textContent = text;
        content.append(responseText);

        const actions = document.createElement("div");
        actions.className = "message-actions";
        const copyButton = document.createElement("button");
        copyButton.className = "copy-button";
        copyButton.type = "button";
        copyButton.setAttribute("aria-label", "Copy response");
        copyButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"></rect><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"></path></svg><span>Copy</span>';
        copyButton.addEventListener("click", async () => {
            try {
                await navigator.clipboard.writeText(text);
                copyButton.querySelector("span").textContent = "Copied";
                copyButton.setAttribute("aria-label", "Response copied");
                copyButton.classList.add("copied");
                window.setTimeout(() => {
                    copyButton.querySelector("span").textContent = "Copy";
                    copyButton.setAttribute("aria-label", "Copy response");
                    copyButton.classList.remove("copied");
                }, 1600);
            } catch (error) {
                console.error("Could not copy response:", error);
                copyButton.querySelector("span").textContent = "Copy failed";
                copyButton.setAttribute("aria-label", "Could not copy response");
            }
        });
        actions.append(copyButton);
        content.append(actions);
    } else {
        content.textContent = text;
    }

    message.append(content);
    messagesContainer.append(message);
    scrollToLatest();
    return message;
}

function resizeInput() {
    questionInput.style.height = "auto";
    questionInput.style.height = `${Math.min(questionInput.scrollHeight, 180)}px`;
    sendButton.disabled = isSending || !questionInput.value.trim();
}

async function sendMessage(text) {
    const content = text.trim();
    if (!content || isSending) return;

    welcome.hidden = true;
    createMessage("user", content);
    questionInput.value = "";
    resizeInput();
    isSending = true;
    sendButton.disabled = true;

    const thinking = createMessage("model", "Thinking…");
    thinking.classList.add("thinking");

    try {
        const response = await fetch(apiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                messages: [...conversationHistory.slice(-38), { role: "user", content }]
            })
        });
        let data;
        try {
            data = await response.json();
        } catch {
            throw new Error(
                `The server returned an invalid response (HTTP ${response.status}). ` +
                "Make sure the Gemini backend is running with `npm start` in the Backend folder."
            );
        }

        if (!response.ok) {
            throw new Error(data.error || `Request failed (${response.status}).`);
        }
        if (typeof data.answer !== "string" || !data.answer.trim()) {
            throw new Error("Gemini returned an empty response. Please try again.");
        }

        thinking.remove();
        createMessage("model", data.answer);
        conversationHistory.push(
            { role: "user", content },
            { role: "model", content: data.answer }
        );
    } catch (error) {
        console.error("Chat request failed:", error);
        thinking.remove();
        createMessage("model", error.message || "Unable to reach Gemini. Please try again.", true);
    } finally {
        isSending = false;
        resizeInput();
        questionInput.focus();
    }
}

function startNewChat() {
    if (isSending) return;
    conversationHistory = [];
    messagesContainer.replaceChildren();
    welcome.hidden = false;
    questionInput.value = "";
    resizeInput();
    questionInput.focus();
}

composer.addEventListener("submit", (event) => {
    event.preventDefault();
    sendMessage(questionInput.value);
});

questionInput.addEventListener("input", resizeInput);
questionInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        if (!sendButton.disabled) composer.requestSubmit();
    }
});

newChatButtons.forEach((button) => button.addEventListener("click", startNewChat));

document.querySelectorAll(".suggestion").forEach((button) => {
    button.addEventListener("click", () => sendMessage(button.textContent));
});
