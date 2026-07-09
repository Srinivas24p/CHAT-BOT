document.addEventListener('DOMContentLoaded', () => {
    const chatForm = document.getElementById('chat-form');
    const userInput = document.getElementById('user-input');
    const messagesContainer = document.getElementById('messages-container');
    const clearBtn = document.getElementById('clear-btn');
    const intentValue = document.getElementById('intent-value');
    
    // LangGraph Node Elements
    const nodeClassify = document.getElementById('node-classify');
    const nodeRespond = document.getElementById('node-respond');

    // Default welcome message HTML template to restore on clear
    const welcomeHTML = `
        <div class="avatar">🤖</div>
        <div class="message-bubble">
            <p>Welcome! I'm <strong>AetherMind</strong>, a chatbot.</p>
            <p>Ask me anything or try one of the suggested prompts below!</p>
        </div>
    `;

    // 1. HELPER: Format Markdown-like syntax to HTML
    function formatResponseText(text) {
        if (!text) return "";
        
        let html = text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
        
        // Bold: **text** -> <strong>text</strong>
        html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        
        // Italic: *text* -> <em>text</em>
        html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
        
        // Inline code: `code` -> <code>code</code>
        html = html.replace(/`(.*?)`/g, '<code>$1</code>');
        
        // Blockquotes
        html = html.replace(/^&gt;\s+(.*)$/gm, '<blockquote>$1</blockquote>');
        
        // Handle line breaks and lists
        let paragraphs = html.split('\n\n');
        html = paragraphs.map(p => {
            let trimmed = p.trim();
            if (!trimmed) return "";
            
            // Check if it looks like an unordered list
            if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
                let items = trimmed.split(/\n[*|-]\s+/);
                if (items[0].startsWith('* ') || items[0].startsWith('- ')) {
                    items[0] = items[0].substring(2);
                }
                return '<ul>' + items.map(item => `<li>${item.replace(/\n/g, '<br>')}</li>`).join('') + '</ul>';
            }
            return `<p>${trimmed.replace(/\n/g, '<br>')}</p>`;
        }).join('');
        
        return html;
    }

    // 2. HELPER: Scroll messages list to bottom
    function scrollToBottom() {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    // 3. HELPER: Append a new message to the panel
    function appendMessage(sender, content, isHtml = false) {
        const wrapper = document.createElement('div');
        wrapper.classList.add('message-wrapper', `${sender}-message`);
        
        const avatar = document.createElement('div');
        avatar.classList.add('avatar');
        avatar.textContent = sender === 'bot' ? '🤖' : '👤';
        
        const bubble = document.createElement('div');
        bubble.classList.add('message-bubble');
        
        if (isHtml) {
            bubble.innerHTML = content;
        } else {
            bubble.innerHTML = formatResponseText(content);
        }
        
        wrapper.appendChild(avatar);
        wrapper.appendChild(bubble);
        messagesContainer.appendChild(wrapper);
        scrollToBottom();
    }

    // 4. HELPER: Manage LangGraph Node Visual States
    function updateNodeState(nodeEl, status) {
        const statusEl = nodeEl.querySelector('.node-status');
        
        nodeEl.classList.remove('active', 'completed');
        
        if (status === 'active') {
            nodeEl.classList.add('active');
            statusEl.textContent = 'Processing...';
        } else if (status === 'completed') {
            nodeEl.classList.add('completed');
            statusEl.textContent = 'Completed';
        } else {
            statusEl.textContent = 'Idle';
        }
    }

    function resetNodeStates() {
        updateNodeState(nodeClassify, 'idle');
        updateNodeState(nodeRespond, 'idle');
    }

    // 5. HELPER: Show/Hide typing loader
    let typingIndicator = null;
    
    function showTypingIndicator() {
        if (typingIndicator) return;
        
        typingIndicator = document.createElement('div');
        typingIndicator.classList.add('message-wrapper', 'bot-message', 'temp-loader');
        
        typingIndicator.innerHTML = `
            <div class="avatar">🤖</div>
            <div class="message-bubble">
                <div class="typing-indicator">
                    <span class="typing-dot"></span>
                    <span class="typing-dot"></span>
                    <span class="typing-dot"></span>
                </div>
            </div>
        `;
        
        messagesContainer.appendChild(typingIndicator);
        scrollToBottom();
    }

    function hideTypingIndicator() {
        if (typingIndicator) {
            typingIndicator.remove();
            typingIndicator = null;
        }
    }

    // 6. ACTION: Submit query to API
    async function sendMessage(question) {
        if (!question.trim()) return;
        
        // Add user message to UI
        appendMessage('user', question);
        userInput.value = '';
        
        // Show loading state
        showTypingIndicator();
        
        // Step 1 of StateGraph: classify is active
        updateNodeState(nodeClassify, 'active');
        updateNodeState(nodeRespond, 'idle');
        intentValue.textContent = 'Analyzing...';
        intentValue.style.color = 'var(--text-secondary)';

        try {
            // Fake brief delay for classification micro-animation
            await new Promise(resolve => setTimeout(resolve, 600));
            
            // Step 2 of StateGraph: classify is done, respond is active
            updateNodeState(nodeClassify, 'completed');
            updateNodeState(nodeRespond, 'active');

            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ question: question })
            });

            const data = await response.json();
            
            hideTypingIndicator();

            if (response.ok) {
                // Update final nodes
                updateNodeState(nodeRespond, 'completed');
                
                // Display classified intent & response
                const intent = data.classification || 'unknown';
                intentValue.textContent = intent.toUpperCase();
                intentValue.style.color = intent === 'greeting' ? 'var(--accent)' : 'var(--primary-hover)';
                
                appendMessage('bot', data.response);
            } else {
                resetNodeStates();
                intentValue.textContent = 'ERROR';
                intentValue.style.color = '#ef4444';
                appendMessage('bot', `*Error:* ${data.error || 'Something went wrong.'}`);
            }
        } catch (error) {
            hideTypingIndicator();
            resetNodeStates();
            intentValue.textContent = 'ERROR';
            intentValue.style.color = '#ef4444';
            appendMessage('bot', `*Error:* Failed to connect to server. Details: ${error.message}`);
        }
    }

    // 7. LISTENERS: Submit and click events
    chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        sendMessage(userInput.value);
    });

    clearBtn.addEventListener('click', () => {
        messagesContainer.innerHTML = '';
        const welcomeWrapper = document.createElement('div');
        welcomeWrapper.classList.add('message-wrapper', 'bot-message');
        welcomeWrapper.innerHTML = welcomeHTML;
        messagesContainer.appendChild(welcomeWrapper);
        
        resetNodeStates();
        intentValue.textContent = 'None';
        intentValue.style.color = 'var(--accent)';
    });

    // Add prompt click handlers to suggestions
    document.querySelectorAll('.suggest-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            // Extract query from text (stripping emoji if present)
            const text = btn.textContent.replace(/[\u{1F300}-\u{1F6FF}]/gu, '').trim();
            sendMessage(text);
        });
    });
});
