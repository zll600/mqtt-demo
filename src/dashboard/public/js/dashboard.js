// MQTT Dashboard JavaScript
class MQTTDashboard {
	constructor() {
		this.socket = null;
		this.devices = new Map();
		this.notifications = [];
		this.currentView = "grid";
		this.energyChart = null;
		this.energyData = [];

		this.init();
	}

	init() {
		this.connectWebSocket();
		this.initializeChart();
		this.setupEventListeners();

		console.log("🌐 MQTT Dashboard initialized");
	}

	connectWebSocket() {
		this.socket = io();

		this.socket.on("connect", () => {
			this.updateConnectionStatus(true);
			this.showAlert("Connected to dashboard server", "success");
		});

		this.socket.on("disconnect", () => {
			this.updateConnectionStatus(false);
			this.showAlert("Disconnected from dashboard server", "warning");
		});

		this.socket.on("initial-data", (data) => {
			console.log("📊 Received initial data:", data);
			this.handleInitialData(data);
		});

		this.socket.on("device-data", (data) => {
			this.handleDeviceData(data);
		});

		this.socket.on("device-status", (data) => {
			this.handleDeviceStatus(data);
		});

		this.socket.on("notification", (notification) => {
			this.handleNotification(notification);
		});

		this.socket.on("control-center-status", (status) => {
			this.updateControlCenterStatus(status);
		});

		this.socket.on("rule-stats", (stats) => {
			this.updateRuleStats(stats);
		});
	}

	handleInitialData(data) {
		// Load devices
		if (data.devices) {
			data.devices.forEach((device) => {
				this.devices.set(device.id, device);
			});
			this.renderDevices();
		}

		// Load notifications
		if (data.notifications) {
			this.notifications = data.notifications;
			this.renderNotifications();
		}

		// Update control center status
		if (data.controlCenterStatus) {
			this.updateControlCenterStatus(data.controlCenterStatus);
		}

		// Update rule stats
		if (data.ruleStats) {
			this.updateRuleStats(data.ruleStats);
		}

		this.updateStats();
	}

	handleDeviceData(data) {
		const device = this.devices.get(data.deviceId);
		if (device) {
			if (!device.data) device.data = {};
			device.data[data.metric] = {
				value: data.value,
				timestamp: new Date(data.timestamp),
			};
			device.lastSeen = new Date(data.timestamp);

			this.updateDeviceCard(device);

			// Update energy chart if it's energy data
			if (
				data.metric === "power" &&
				data.value &&
				typeof data.value.value === "number"
			) {
				this.updateEnergyChart(data.value.value);
			}
		}
	}

	handleDeviceStatus(device) {
		this.devices.set(device.id, { ...this.devices.get(device.id), ...device });
		this.updateDeviceCard(device);
		this.updateStats();
	}

	handleNotification(notification) {
		this.notifications.unshift(notification);
		if (this.notifications.length > 50) {
			this.notifications = this.notifications.slice(0, 50);
		}

		this.renderNotifications();
		this.updateStats();

		// Show toast for high severity notifications
		if (notification.severity === "high") {
			this.showAlert(notification.message, "danger", 5000);
		}
	}

	renderDevices() {
		const container = document.getElementById("devices-container");
		container.innerHTML = "";

		// Group devices by room
		const devicesByRoom = new Map();
		this.devices.forEach((device) => {
			const room = device.room || "Unknown";
			if (!devicesByRoom.has(room)) {
				devicesByRoom.set(room, []);
			}
			devicesByRoom.get(room).push(device);
		});

		// Render devices by room
		devicesByRoom.forEach((devices, room) => {
			const roomSection = this.createRoomSection(room, devices);
			container.appendChild(roomSection);
		});

		this.updateStats();
	}

	createRoomSection(roomName, devices) {
		const section = document.createElement("div");
		section.className = "col-12 room-section";

		const roomTitle =
			roomName.charAt(0).toUpperCase() + roomName.slice(1).replace("-", " ");

		section.innerHTML = `
            <div class="room-header">
                <h5 class="mb-0"><i class="fas fa-door-open me-2"></i>${roomTitle}</h5>
                <small>${devices.length} device(s)</small>
            </div>
            <div class="room-devices row" id="room-${roomName}">
            </div>
        `;

		const roomContainer = section.querySelector(`#room-${roomName}`);
		devices.forEach((device) => {
			const deviceCard = this.createDeviceCard(device);
			roomContainer.appendChild(deviceCard);
		});

		return section;
	}

	createDeviceCard(device) {
		const col = document.createElement("div");
		col.className =
			this.currentView === "grid" ? "col-md-4 col-sm-6" : "col-12";

		const isOnline = device.online !== false;
		const deviceIcon = this.getDeviceIcon(device.deviceType);
		const deviceData = this.getDeviceDisplayData(device);

		col.innerHTML = `
            <div class="card device-card ${isOnline ? "online" : "offline"}" 
                 onclick="openDeviceControl('${device.id}')" 
                 data-device-id="${device.id}">
                <div class="device-status ${isOnline ? "online" : "offline"}"></div>
                <div class="card-body text-center">
                    <div class="device-icon ${device.deviceType}">
                        <i class="${deviceIcon}"></i>
                    </div>
                    <h6 class="card-title">${device.name}</h6>
                    <div class="device-metrics">
                        ${deviceData}
                    </div>
                    <small class="text-muted">
                        Last seen: ${device.lastSeen ? new Date(device.lastSeen).toLocaleTimeString() : "Never"}
                    </small>
                </div>
            </div>
        `;

		return col;
	}

	updateDeviceCard(device) {
		const deviceCard = document.querySelector(
			`[data-device-id="${device.id}"]`,
		);
		if (deviceCard) {
			const isOnline = device.online !== false;
			deviceCard.className = `card device-card ${isOnline ? "online" : "offline"}`;

			const statusElement = deviceCard.querySelector(".device-status");
			statusElement.className = `device-status ${isOnline ? "online" : "offline"}`;

			const metricsElement = deviceCard.querySelector(".device-metrics");
			metricsElement.innerHTML = this.getDeviceDisplayData(device);

			const lastSeenElement = deviceCard.querySelector(".text-muted");
			lastSeenElement.textContent = `Last seen: ${device.lastSeen ? new Date(device.lastSeen).toLocaleTimeString() : "Never"}`;
		}
	}

	getDeviceIcon(deviceType) {
		const iconMap = {
			"temperature-humidity-sensor": "fas fa-thermometer-half",
			"motion-detector": "fas fa-walking",
			"door-sensor": "fas fa-door-open",
			"window-sensor": "fas fa-window-maximize",
			"smart-light": "fas fa-lightbulb",
			"energy-meter": "fas fa-bolt",
		};

		return iconMap[deviceType] || "fas fa-microchip";
	}

	getDeviceDisplayData(device) {
		if (!device.data) return '<div class="text-muted">No data</div>';

		let html = "";

		// Handle different device types
		if (device.deviceType.includes("temperature")) {
			if (device.data.temperature) {
				const temp = device.data.temperature.value;
				const tempClass = this.getTemperatureClass(temp.value);
				html += `<div class="device-metric"><span class="${tempClass}">${temp.value}°${temp.unit}</span></div>`;
			}
			if (device.data.humidity) {
				const humidity = device.data.humidity.value;
				const humidityClass = this.getHumidityClass(humidity.value);
				html += `<div class="device-metric"><span class="${humidityClass}">${humidity.value}%</span></div>`;
			}
		} else if (device.deviceType.includes("motion")) {
			if (device.data.motion) {
				const detected = device.data.motion.value.detected;
				const icon = detected
					? "fas fa-eye text-warning"
					: "fas fa-eye-slash text-muted";
				html += `<div class="device-metric"><i class="${icon}"></i> ${detected ? "Motion" : "Clear"}</div>`;
			}
		} else if (
			device.deviceType.includes("door") ||
			device.deviceType.includes("window")
		) {
			if (device.data.state) {
				const state = device.data.state.value.state;
				const icon =
					state === "open"
						? "fas fa-door-open text-warning"
						: "fas fa-door-closed text-success";
				html += `<div class="device-metric"><i class="${icon}"></i> ${state}</div>`;
			}
		} else if (device.deviceType.includes("light")) {
			if (device.data.state) {
				const lightState = device.data.state.value;
				const icon = lightState.on
					? "fas fa-lightbulb text-warning"
					: "fas fa-lightbulb text-muted";
				html += `<div class="device-metric"><i class="${icon}"></i> ${lightState.on ? "On" : "Off"}</div>`;
				if (lightState.on) {
					html += `<div class="device-metric">Brightness: ${lightState.brightness}%</div>`;
				}
			}
		} else if (device.deviceType.includes("energy")) {
			if (device.data.power) {
				const power = device.data.power.value;
				html += `<div class="device-metric"><i class="fas fa-bolt text-primary"></i> ${power.consumption?.toFixed(1) || power.value?.toFixed(1) || 0} W</div>`;
			}
			if (device.data.energy) {
				const energy = device.data.energy.value;
				html += `<div class="device-metric">Total: ${energy.value?.toFixed(2) || 0} kWh</div>`;
			}
		}

		return html || '<div class="text-muted">No data available</div>';
	}

	getTemperatureClass(temp) {
		if (temp < 10) return "temp-cold";
		if (temp < 18) return "temp-cool";
		if (temp < 25) return "temp-normal";
		if (temp < 30) return "temp-warm";
		return "temp-hot";
	}

	getHumidityClass(humidity) {
		if (humidity < 30) return "humidity-low";
		if (humidity > 70) return "humidity-high";
		return "humidity-normal";
	}

	renderNotifications() {
		const container = document.getElementById("notifications-container");
		container.innerHTML = "";

		if (this.notifications.length === 0) {
			container.innerHTML =
				'<div class="text-center text-muted p-3">No notifications</div>';
			return;
		}

		this.notifications.slice(0, 10).forEach((notification) => {
			const notificationElement = this.createNotificationElement(notification);
			container.appendChild(notificationElement);
		});
	}

	createNotificationElement(notification) {
		const div = document.createElement("div");
		div.className = `notification-item p-3 border-bottom severity-${notification.severity}`;

		const severityIcon = {
			low: "fas fa-info-circle text-success",
			medium: "fas fa-exclamation-triangle text-warning",
			high: "fas fa-exclamation-circle text-danger",
		}[notification.severity];

		const timestamp = new Date(notification.timestamp).toLocaleString();

		div.innerHTML = `
            <div class="d-flex">
                <div class="me-2">
                    <i class="${severityIcon}"></i>
                </div>
                <div class="flex-grow-1">
                    <div class="fw-bold">${notification.message}</div>
                    <small class="text-muted">${timestamp}</small>
                    ${notification.deviceId ? `<div><small class="badge bg-secondary">${notification.deviceId}</small></div>` : ""}
                </div>
            </div>
        `;

		return div;
	}

	updateConnectionStatus(connected) {
		const statusElement = document.getElementById("connection-status");
		if (connected) {
			statusElement.innerHTML = '<i class="fas fa-circle me-1"></i>Connected';
			statusElement.className = "badge bg-success";
		} else {
			statusElement.innerHTML =
				'<i class="fas fa-circle me-1"></i>Disconnected';
			statusElement.className = "badge bg-danger";
		}
	}

	updateControlCenterStatus(status) {
		const container = document.getElementById("control-center-status");

		if (!status) {
			container.innerHTML =
				'<div class="text-center text-muted">Control Center Offline</div>';
			return;
		}

		const onlineIcon = status.online
			? "fas fa-check-circle text-success"
			: "fas fa-times-circle text-danger";
		const automationIcon = status.automationEnabled
			? "fas fa-play text-success"
			: "fas fa-pause text-warning";

		container.innerHTML = `
            <div class="row text-center">
                <div class="col-6">
                    <div><i class="${onlineIcon}"></i></div>
                    <small>Status</small>
                </div>
                <div class="col-6">
                    <div><i class="${automationIcon}"></i></div>
                    <small>Automation</small>
                </div>
            </div>
            ${
							status.ruleStats
								? `
                <div class="mt-2 small">
                    <div>Active Rules: ${status.ruleStats.enabledRules}</div>
                    <div>Online Devices: ${status.ruleStats.onlineDevices}</div>
                </div>
            `
								: ""
						}
        `;
	}

	updateRuleStats(stats) {
		document.getElementById("active-rules").textContent =
			stats.enabledRules || 0;
	}

	updateStats() {
		const totalDevices = this.devices.size;
		const onlineDevices = Array.from(this.devices.values()).filter(
			(d) => d.online !== false,
		).length;
		const unacknowledgedNotifications = this.notifications.filter(
			(n) => !n.acknowledged,
		).length;

		document.getElementById("device-count").textContent = totalDevices;
		document.getElementById("total-devices").textContent = totalDevices;
		document.getElementById("online-devices").textContent = onlineDevices;
		document.getElementById("notification-count").textContent =
			unacknowledgedNotifications;
	}

	initializeChart() {
		const ctx = document.getElementById("energy-chart").getContext("2d");

		this.energyChart = new Chart(ctx, {
			type: "line",
			data: {
				labels: [],
				datasets: [
					{
						label: "Power (W)",
						data: [],
						borderColor: "rgb(75, 192, 192)",
						backgroundColor: "rgba(75, 192, 192, 0.1)",
						tension: 0.4,
						fill: true,
					},
				],
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				scales: {
					y: {
						beginAtZero: true,
						title: {
							display: true,
							text: "Power (Watts)",
						},
					},
					x: {
						title: {
							display: true,
							text: "Time",
						},
					},
				},
				plugins: {
					legend: {
						display: false,
					},
				},
			},
		});
	}

	updateEnergyChart(powerValue) {
		const now = new Date();
		const timeLabel = now.toLocaleTimeString();

		this.energyData.push({ time: timeLabel, power: powerValue });

		// Keep only last 20 data points
		if (this.energyData.length > 20) {
			this.energyData.shift();
		}

		this.energyChart.data.labels = this.energyData.map((d) => d.time);
		this.energyChart.data.datasets[0].data = this.energyData.map(
			(d) => d.power,
		);
		this.energyChart.update("none");
	}

	setupEventListeners() {
		// Global functions need to be attached to window
		window.openDeviceControl = (deviceId) => {
			this.openDeviceControl(deviceId);
		};

		window.refreshDevices = () => {
			this.renderDevices();
		};

		window.setDeviceView = (view) => {
			this.setDeviceView(view);
		};

		window.clearNotifications = () => {
			this.clearNotifications();
		};
	}

	openDeviceControl(deviceId) {
		const device = this.devices.get(deviceId);
		if (!device) return;

		const modal = new bootstrap.Modal(
			document.getElementById("deviceControlModal"),
		);
		const content = document.getElementById("device-control-content");

		content.innerHTML = this.generateDeviceControlContent(device);

		// Set modal title
		document.querySelector("#deviceControlModal .modal-title").textContent =
			`Control: ${device.name} (${device.room})`;

		modal.show();

		// Set up event listeners for controls
		this.setupDeviceControlListeners(device);
	}

	generateDeviceControlContent(device) {
		let content = `
            <div class="mb-3">
                <h6>Device Information</h6>
                <p><strong>Type:</strong> ${device.deviceType}</p>
                <p><strong>Room:</strong> ${device.room}</p>
                <p><strong>Status:</strong> <span class="badge ${device.online ? "bg-success" : "bg-danger"}">${device.online ? "Online" : "Offline"}</span></p>
            </div>
        `;

		if (device.deviceType.includes("light")) {
			content += this.generateLightControls(device);
		} else if (device.deviceType.includes("temperature")) {
			content += this.generateSensorControls(device);
		} else if (device.deviceType.includes("motion")) {
			content += this.generateMotionControls(device);
		} else {
			content +=
				'<div class="alert alert-info">No specific controls available for this device type.</div>';
		}

		return content;
	}

	generateLightControls(device) {
		const lightState = device.data?.state?.value || {
			on: false,
			brightness: 50,
		};

		return `
            <div class="control-group">
                <h6>Light Controls</h6>
                <div class="row">
                    <div class="col-md-6">
                        <div class="form-check form-switch mb-3">
                            <input class="form-check-input" type="checkbox" id="lightToggle" ${lightState.on ? "checked" : ""}>
                            <label class="form-check-label" for="lightToggle">Power</label>
                        </div>
                    </div>
                    <div class="col-md-6">
                        <label for="brightnessSlider" class="form-label">Brightness: <span id="brightnessValue">${lightState.brightness || 50}%</span></label>
                        <input type="range" class="form-range brightness-slider" id="brightnessSlider" 
                               min="1" max="100" value="${lightState.brightness || 50}">
                    </div>
                </div>
                <div class="row mt-3">
                    <div class="col-12">
                        <h6>Quick Actions</h6>
                        <button class="btn btn-sm btn-outline-primary me-2" onclick="sendDeviceCommand('${device.id}', {command: 'preset', preset: 'bright'})">Bright</button>
                        <button class="btn btn-sm btn-outline-primary me-2" onclick="sendDeviceCommand('${device.id}', {command: 'preset', preset: 'dim'})">Dim</button>
                        <button class="btn btn-sm btn-outline-primary me-2" onclick="sendDeviceCommand('${device.id}', {command: 'preset', preset: 'reading'})">Reading</button>
                        <button class="btn btn-sm btn-outline-primary" onclick="sendDeviceCommand('${device.id}', {command: 'preset', preset: 'relax'})">Relax</button>
                    </div>
                </div>
            </div>
        `;
	}

	generateSensorControls(device) {
		return `
            <div class="control-group">
                <h6>Sensor Controls</h6>
                <button class="btn btn-sm btn-outline-primary me-2" onclick="sendDeviceCommand('${device.id}', {command: 'calibrate'})">Calibrate</button>
                <button class="btn btn-sm btn-outline-secondary" onclick="sendDeviceCommand('${device.id}', {command: 'reset'})">Reset</button>
            </div>
            <div class="control-group">
                <h6>Current Readings</h6>
                ${this.getDeviceDisplayData(device)}
            </div>
        `;
	}

	generateMotionControls(device) {
		return `
            <div class="control-group">
                <h6>Motion Detector Controls</h6>
                <button class="btn btn-sm btn-outline-primary me-2" onclick="sendDeviceCommand('${device.id}', {command: 'test'})">Test Detection</button>
                <button class="btn btn-sm btn-outline-secondary" onclick="sendDeviceCommand('${device.id}', {command: 'calibrate'})">Calibrate</button>
            </div>
            <div class="control-group">
                <h6>Current State</h6>
                ${this.getDeviceDisplayData(device)}
            </div>
        `;
	}

	setupDeviceControlListeners(device) {
		// Light toggle
		const lightToggle = document.getElementById("lightToggle");
		if (lightToggle) {
			lightToggle.addEventListener("change", () => {
				const command = lightToggle.checked ? "turnOn" : "turnOff";
				this.sendDeviceCommand(device.id, { command });
			});
		}

		// Brightness slider
		const brightnessSlider = document.getElementById("brightnessSlider");
		const brightnessValue = document.getElementById("brightnessValue");
		if (brightnessSlider && brightnessValue) {
			brightnessSlider.addEventListener("input", () => {
				brightnessValue.textContent = `${brightnessSlider.value}%`;
			});

			brightnessSlider.addEventListener("change", () => {
				this.sendDeviceCommand(device.id, {
					command: "setBrightness",
					brightness: parseInt(brightnessSlider.value),
				});
			});
		}

		// Global function for quick commands
		window.sendDeviceCommand = (deviceId, command) => {
			this.sendDeviceCommand(deviceId, command);
		};
	}

	sendDeviceCommand(deviceId, command) {
		if (this.socket) {
			console.log("🎛️ Sending device command:", { deviceId, command });
			this.socket.emit("device-command", { deviceId, command });
			this.showAlert(`Command sent to ${deviceId}`, "success", 2000);
		}
	}

	setDeviceView(view) {
		this.currentView = view;

		// Update button states
		document.querySelectorAll(".btn-group button").forEach((btn) => {
			btn.classList.remove("active");
		});
		event.target.classList.add("active");

		this.renderDevices();
	}

	clearNotifications() {
		this.notifications = [];
		this.renderNotifications();
		this.updateStats();
	}

	showAlert(message, type = "info", duration = 3000) {
		const alertContainer = document.getElementById("alert-container");
		const alertId = `alert-${Date.now()}`;

		const alertElement = document.createElement("div");
		alertElement.id = alertId;
		alertElement.className = `alert alert-${type} alert-dismissible fade show`;
		alertElement.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;

		alertContainer.appendChild(alertElement);

		// Auto-dismiss after duration
		setTimeout(() => {
			const alert = document.getElementById(alertId);
			if (alert) {
				const bsAlert = new bootstrap.Alert(alert);
				bsAlert.close();
			}
		}, duration);
	}
}

// Initialize dashboard when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
	window.dashboard = new MQTTDashboard();
});
