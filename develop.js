document.addEventListener("DOMContentLoaded", function () {
    require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.34.1/min/vs' } });

    require(["vs/editor/editor.main"], function () {
        if (typeof monaco === "undefined") {
            console.error("❌ Error: Monaco Editor failed to load!");
            return;
        }

        const htmlContainer = document.getElementById("HTMLcode");
        const cssContainer = document.getElementById("CSScode");
        const jsContainer = document.getElementById("JScode");
        const livePreview = document.getElementById("livePreview");
        const consoleContainer = document.getElementById("console-container");
        const consoleOutput = document.getElementById("console-output");

        if (!htmlContainer || !cssContainer || !jsContainer || !livePreview || !consoleContainer || !consoleOutput) {
            console.error("❌ Error: Missing required elements.");
            return;
        }

        const socket = io("http://localhost:5578", { reconnection: true });

        function getSavedCode(key, defaultValue) {
            return localStorage.getItem(key) || defaultValue;
        }

        window.monaco = monaco;

        window.editors = {
            html: monaco.editor.create(htmlContainer, {
                value: getSavedCode("htmlCode", "<!-- Write your HTML here -->"),
                language: "html",
                theme: "vs-dark",
                automaticLayout: true
            }),
            css: monaco.editor.create(cssContainer, {
                value: getSavedCode("cssCode", "/* Write your CSS here */"),
                language: "css",
                theme: "vs-dark",
                automaticLayout: true
            }),
            js: monaco.editor.create(jsContainer, {
                value: getSavedCode("jsCode", "// Write your JavaScript here"),
                language: "javascript",
                theme: "vs-dark",
                automaticLayout: true
            })
        };

        let roomId = localStorage.getItem("roomId");
        let isCreator = false;
        let userCount = 0; // Track number of users in the room

        const collabDiv = document.createElement("div");
        collabDiv.innerHTML = `
            <button id="createRoom">Create Room</button>
            <input id="roomInput" placeholder="Enter Room ID" />
            <button id="joinRoom">Join Room</button>
            <button id="deleteRoom" style="display:none;">Delete Room</button>
            <button id="leaveRoom" style="display:none;">Disconnect</button>
            <p id="roomStatus"></p>
            <p id="userCount" style="color:white;"></p>
        `;
        document.body.insertBefore(collabDiv, document.querySelector("nav"));

        if (roomId) {
            socket.emit("rejoinRoom", roomId);
        }

        document.getElementById("createRoom").addEventListener("click", () => {
            socket.emit("createRoom");
        });

        document.getElementById("joinRoom").addEventListener("click", () => {
            const inputRoomId = document.getElementById("roomInput").value;
            if (inputRoomId) {
                socket.emit("joinRoom", inputRoomId);
            }
        });

        document.getElementById("deleteRoom").addEventListener("click", () => {
            if (roomId && isCreator) {
                socket.emit("deleteRoom", roomId);
            }
        });

        document.getElementById("leaveRoom").addEventListener("click", () => {
            if (roomId) {
                socket.emit("leaveRoom", roomId);
            }
        });

        socket.on("roomCreated", (data) => {
            roomId = data.roomId;
            isCreator = data.isCreator;
            userCount = 1; // Creator starts as the only user
            localStorage.setItem("roomId", roomId);
            document.getElementById("roomStatus").textContent = `Room ID: ${roomId} (Share this ID to collaborate)`;
            document.getElementById("userCount").textContent = `Users in room: ${userCount}`;
            document.getElementById("deleteRoom").style.display = "inline";
            document.getElementById("leaveRoom").style.display = "none";
        });

        socket.on("joinedRoom", (data) => {
            roomId = data.roomId;
            isCreator = data.isCreator;
            localStorage.setItem("roomId", roomId);
            document.getElementById("roomStatus").textContent = `Joined Room: ${roomId}`;
            editors.html.setValue(data.code.html || "");
            editors.css.setValue(data.code.css || "");
            editors.js.setValue(data.code.js || "");
            updateOutput();
            document.getElementById("deleteRoom").style.display = isCreator ? "inline" : "none";
            document.getElementById("leaveRoom").style.display = "inline";
            userCount = data.userCount || userCount + 1; // Update user count
            document.getElementById("userCount").textContent = `Users in room: ${userCount}`;
        });

        socket.on("error", (msg) => {
            document.getElementById("roomStatus").textContent = msg;
            localStorage.removeItem("roomId");
            roomId = null;
            isCreator = false;
            userCount = 0;
            document.getElementById("deleteRoom").style.display = "none";
            document.getElementById("leaveRoom").style.display = "none";
            document.getElementById("userCount").textContent = "";
        });

        socket.on("codeUpdated", ({ type, value }) => {
            if (editors[type].getValue() !== value) { // Avoid redundant updates
                editors[type].setValue(value);
                updateOutput();
            }
        });

        socket.on("userJoined", (data) => {
            userCount++;
            document.getElementById("userCount").textContent = `Users in room: ${userCount}`;
            console.log(`User ${data.userId} joined the room`);
        });

        socket.on("userLeft", (data) => {
            userCount--;
            document.getElementById("userCount").textContent = `Users in room: ${userCount}`;
            console.log(`User ${data.userId} left the room`);
        });

        socket.on("roomDeleted", () => {
            document.getElementById("roomStatus").textContent = "Room has been deleted by the creator.";
            localStorage.removeItem("roomId");
            roomId = null;
            isCreator = false;
            userCount = 0;
            document.getElementById("deleteRoom").style.display = "none";
            document.getElementById("leaveRoom").style.display = "none";
            document.getElementById("userCount").textContent = "";
        });

        socket.on("leftRoom", () => {
            document.getElementById("roomStatus").textContent = "You have disconnected from the room.";
            localStorage.removeItem("roomId");
            roomId = null;
            isCreator = false;
            userCount = 0;
            document.getElementById("deleteRoom").style.display = "none";
            document.getElementById("leaveRoom").style.display = "none";
            document.getElementById("userCount").textContent = "";
        });

        socket.on("connect", () => {
            console.log("Reconnected to server");
            if (roomId) {
                socket.emit("rejoinRoom", roomId);
            }
        });

        socket.on("disconnect", () => {
            console.log("Disconnected from server");
        });

        function autoSaveCode() {
            localStorage.setItem("htmlCode", editors.html.getValue());
            localStorage.setItem("cssCode", editors.css.getValue());
            localStorage.setItem("jsCode", editors.js.getValue());
        }

        function updateOutput() {
            const htmlCode = editors.html.getValue();
            const cssCode = editors.css.getValue();
            const jsCode = editors.js.getValue();

            const fullCode = `
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <style>${cssCode}</style>
                </head>
                <body>
                    ${htmlCode}
                </body>
                <script>
                    (function() {
                        var oldLog = console.log;
                        var oldError = console.error;
                        var oldWarn = console.warn;
                        var consoleOutput = window.parent.document.getElementById("console-output");
                        console.log = function(message) {
                            oldLog.apply(console, arguments);
                            consoleOutput.innerHTML += '<p style="color:white;">[LOG] ' + message + '</p>';
                            consoleOutput.scrollTop = consoleOutput.scrollHeight;
                        };
                        console.error = function(message) {
                            oldError.apply(console, arguments);
                            consoleOutput.innerHTML += '<p style="color:red;">[ERROR] ' + message + '</p>';
                            consoleOutput.scrollTop = consoleOutput.scrollHeight;
                        };
                        console.warn = function(message) {
                            oldWarn.apply(console, arguments);
                            consoleOutput.innerHTML += '<p style="color:yellow;">[WARN] ' + message + '</p>';
                            consoleOutput.scrollTop = consoleOutput.scrollHeight;
                        };
                    })();
                    ${jsCode}
                </script>
                </html>
            `;
            livePreview.srcdoc = fullCode;
        }

        function debounce(func, delay) {
            let timeout;
            return function () {
                clearTimeout(timeout);
                timeout = setTimeout(func, delay);
            };
        }

        const debouncedUpdate = debounce(() => {
            updateOutput();
            autoSaveCode();
            if (roomId) {
                socket.emit("codeUpdate", {
                    roomId,
                    type: "html",
                    value: editors.html.getValue()
                });
                socket.emit("codeUpdate", {
                    roomId,
                    type: "css",
                    value: editors.css.getValue()
                });
                socket.emit("codeUpdate", {
                    roomId,
                    type: "js",
                    value: editors.js.getValue()
                });
            }
        }, 100);

        Object.values(editors).forEach(editor => {
            editor.onDidChangeModelContent(debouncedUpdate);
        });

        updateOutput();

        document.getElementById("downloadCode").addEventListener("click", function () {
            const codeData = {
                html: editors.html.getValue(),
                css: editors.css.getValue(),
                js: editors.js.getValue(),
            };
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(codeData));
            const downloadAnchor = document.createElement("a");
            downloadAnchor.setAttribute("href", dataStr);
            downloadAnchor.setAttribute("download", "codeBackup.json");
            document.body.appendChild(downloadAnchor);
            downloadAnchor.click();
            document.body.removeChild(downloadAnchor);
        });

        document.getElementById("uploadCode").addEventListener("change", function (event) {
            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = function (e) {
                try {
                    const uploadedData = JSON.parse(e.target.result);
                    editors.html.setValue(uploadedData.html || "");
                    editors.css.setValue(uploadedData.css || "");
                    editors.js.setValue(uploadedData.js || "");
                    updateOutput();
                } catch (error) {
                    console.error("Error loading file:", error);
                }
            };
            reader.readAsText(file);
        });

        document.querySelector('.menu-btn').addEventListener('click', function () {
            document.getElementById('draw-menu').classList.toggle('active');
        });

        document.getElementById("clear-console").addEventListener("click", function () {
            consoleOutput.innerHTML = "";
        });
    });
});