import type { MqttConfig } from "../../config/mqtt-config.js";
import logger from "../../utils/logger.js";
import { BaseDevice } from "../base-device.js";

interface LightState {
	on: boolean;
	brightness: number; // 0-100
	color?: {
		r: number; // 0-255
		g: number; // 0-255
		b: number; // 0-255
	};
	colorTemperature?: number; // 2700K-6500K
	powerConsumption: number; // Watts
}

export class SmartLight extends BaseDevice {
	private lightState: LightState;
	private supportsColor: boolean;
	private maxWattage: number = 12; // LED bulb wattage
	private scheduleTimeout: NodeJS.Timeout | null = null;

	constructor(
		room: string,
		name: string,
		config: MqttConfig,
		supportsColor: boolean = false,
		deviceId?: string,
	) {
		super("smart-light", room, name, config, deviceId);
		this.supportsColor = supportsColor;
		this.lightState = {
			on: false,
			brightness: 80,
			colorTemperature: 3000, // Warm white default
			powerConsumption: 0,
		};

		if (supportsColor) {
			this.lightState.color = { r: 255, g: 255, b: 255 }; // White default
		}
	}

	protected async publishData(): Promise<void> {
		// Update power consumption based on current state
		this.updatePowerConsumption();

		// Publish current state
		await this.publishLightState();

		// Simulate gradual changes (dimming, color transitions)
		this.simulateGradualChanges();
	}

	protected handleCommand(topic: string, payload: any): void {
		logger.info(
			{
				topic,
				payload,
			},
			`Smart light ${this.deviceId} received command:`,
		);

		if (payload.command) {
			switch (payload.command) {
				case "turnOn":
					this.turnOn();
					break;
				case "turnOff":
					this.turnOff();
					break;
				case "toggle":
					this.toggle();
					break;
				case "setBrightness":
					if (typeof payload.brightness === "number") {
						this.setBrightness(payload.brightness);
					}
					break;
				case "setColor":
					if (this.supportsColor && payload.color) {
						this.setColor(payload.color.r, payload.color.g, payload.color.b);
					}
					break;
				case "setColorTemperature":
					if (typeof payload.colorTemperature === "number") {
						this.setColorTemperature(payload.colorTemperature);
					}
					break;
				case "dim":
					this.dim(payload.amount || 10);
					break;
				case "brighten":
					this.brighten(payload.amount || 10);
					break;
				case "schedule":
					this.scheduleAction(payload.action, payload.delayMs);
					break;
				case "preset":
					this.applyPreset(payload.preset);
					break;
				default:
					logger.info(`Unknown command: ${payload.command}`);
			}
		}
	}

	protected getDeviceInfo(): Record<string, any> {
		return {
			...this.lightState,
			supportsColor: this.supportsColor,
			maxWattage: this.maxWattage,
			efficiency: this.calculateEfficiency(),
		};
	}

	private async publishLightState(): Promise<void> {
		// Publish with QoS 1 and retain for reliable state updates
		await this.publish("state", this.lightState, 1, true);

		// Also publish individual metrics
		await this.publish(
			"brightness",
			{
				value: this.lightState.brightness,
				percentage: this.lightState.brightness,
			},
			0,
		);

		await this.publish(
			"power",
			{
				consumption: this.lightState.powerConsumption,
				unit: "watts",
				efficiency: this.calculateEfficiency(),
			},
			0,
		);

		if (this.supportsColor && this.lightState.color) {
			await this.publish(
				"color",
				{
					rgb: this.lightState.color,
					hex: this.rgbToHex(this.lightState.color),
				},
				0,
			);
		}
	}

	private updatePowerConsumption(): void {
		if (!this.lightState.on) {
			this.lightState.powerConsumption = 0;
			return;
		}

		// Calculate power consumption based on brightness
		const basePower = this.maxWattage * (this.lightState.brightness / 100);

		// Add small random variation to simulate real-world conditions
		const variation = (Math.random() - 0.5) * 0.2; // ±10% variation
		this.lightState.powerConsumption = Math.max(0, basePower * (1 + variation));
	}

	private simulateGradualChanges(): void {
		// Occasionally simulate automatic adjustments (like adaptive brightness)
		if (Math.random() < 0.05 && this.lightState.on) {
			// 5% chance
			const hour = new Date().getHours();

			// Auto-adjust color temperature based on time of day
			let targetColorTemp = this.lightState.colorTemperature || 3000;

			if (hour >= 18 || hour <= 6) {
				// Evening/night - warmer light
				targetColorTemp = Math.max(2700, targetColorTemp - 50);
			} else {
				// Day - cooler light
				targetColorTemp = Math.min(5000, targetColorTemp + 50);
			}

			if (
				Math.abs(targetColorTemp - (this.lightState.colorTemperature || 0)) >
				100
			) {
				this.setColorTemperature(targetColorTemp, true); // auto adjustment
			}
		}
	}

	private async turnOn(): Promise<void> {
		const wasOff = !this.lightState.on;
		this.lightState.on = true;

		if (wasOff) {
			await this.publish(
				"event",
				{
					type: "turned_on",
					brightness: this.lightState.brightness,
					timestamp: new Date().toISOString(),
				},
				1,
			);

			logger.info(
				`Smart light ${this.deviceId} turned ON (${this.lightState.brightness}%)`,
			);
		}
	}

	private async turnOff(): Promise<void> {
		const wasOn = this.lightState.on;
		this.lightState.on = false;

		if (wasOn) {
			await this.publish(
				"event",
				{
					type: "turned_off",
					lastBrightness: this.lightState.brightness,
					timestamp: new Date().toISOString(),
				},
				1,
			);

			logger.info(`Smart light ${this.deviceId} turned OFF`);
		}
	}

	private toggle(): void {
		if (this.lightState.on) {
			this.turnOff();
		} else {
			this.turnOn();
		}
	}

	private async setBrightness(brightness: number): Promise<void> {
		const oldBrightness = this.lightState.brightness;
		this.lightState.brightness = Math.max(1, Math.min(100, brightness));

		if (this.lightState.brightness !== oldBrightness) {
			await this.publish(
				"event",
				{
					type: "brightness_changed",
					oldBrightness,
					newBrightness: this.lightState.brightness,
					timestamp: new Date().toISOString(),
				},
				0,
			);

			logger.info(
				`Smart light ${this.deviceId} brightness set to ${this.lightState.brightness}%`,
			);
		}
	}

	private async setColor(r: number, g: number, b: number): Promise<void> {
		if (!this.supportsColor) {
			logger.info(
				`Smart light ${this.deviceId} does not support color changes`,
			);
			return;
		}

		const oldColor = this.lightState.color
			? { ...this.lightState.color }
			: null;
		this.lightState.color = {
			r: Math.max(0, Math.min(255, r)),
			g: Math.max(0, Math.min(255, g)),
			b: Math.max(0, Math.min(255, b)),
		};

		await this.publish(
			"event",
			{
				type: "color_changed",
				oldColor,
				newColor: this.lightState.color,
				hex: this.rgbToHex(this.lightState.color),
				timestamp: new Date().toISOString(),
			},
			0,
		);

		logger.info(
			`Smart light ${this.deviceId} color set to RGB(${r}, ${g}, ${b})`,
		);
	}

	private async setColorTemperature(
		temperature: number,
		isAutomatic: boolean = false,
	): Promise<void> {
		const oldTemp = this.lightState.colorTemperature;
		this.lightState.colorTemperature = Math.max(
			2700,
			Math.min(6500, temperature),
		);

		if (this.lightState.colorTemperature !== oldTemp) {
			await this.publish(
				"event",
				{
					type: "color_temperature_changed",
					oldTemperature: oldTemp,
					newTemperature: this.lightState.colorTemperature,
					automatic: isAutomatic,
					timestamp: new Date().toISOString(),
				},
				0,
			);

			logger.info(
				`Smart light ${this.deviceId} color temperature set to ${this.lightState.colorTemperature}K ${isAutomatic ? "(automatic)" : ""}`,
			);
		}
	}

	private dim(amount: number): void {
		this.setBrightness(this.lightState.brightness - amount);
	}

	private brighten(amount: number): void {
		this.setBrightness(this.lightState.brightness + amount);
	}

	private scheduleAction(action: string, delayMs: number): void {
		if (this.scheduleTimeout) {
			clearTimeout(this.scheduleTimeout);
		}

		this.scheduleTimeout = setTimeout(() => {
			switch (action) {
				case "turnOn":
					this.turnOn();
					break;
				case "turnOff":
					this.turnOff();
					break;
				case "toggle":
					this.toggle();
					break;
			}
		}, delayMs);

		this.publish(
			"schedule",
			{
				action,
				delayMs,
				scheduledFor: new Date(Date.now() + delayMs).toISOString(),
			},
			1,
		);
	}

	private applyPreset(preset: string): void {
		switch (preset.toLowerCase()) {
			case "bright":
				this.setBrightness(100);
				this.setColorTemperature(5000);
				break;
			case "dim":
				this.setBrightness(20);
				this.setColorTemperature(2700);
				break;
			case "reading":
				this.setBrightness(80);
				this.setColorTemperature(4000);
				break;
			case "relax":
				this.setBrightness(40);
				this.setColorTemperature(2700);
				if (this.supportsColor) {
					this.setColor(255, 200, 150); // Warm orange
				}
				break;
			case "party":
				if (this.supportsColor) {
					const colors = [
						{ r: 255, g: 0, b: 0 }, // Red
						{ r: 0, g: 255, b: 0 }, // Green
						{ r: 0, g: 0, b: 255 }, // Blue
						{ r: 255, g: 255, b: 0 }, // Yellow
						{ r: 255, g: 0, b: 255 }, // Magenta
					];
					const randomColor = colors[Math.floor(Math.random() * colors.length)];
					this.setColor(randomColor.r, randomColor.g, randomColor.b);
					this.setBrightness(100);
				}
				break;
			default:
				logger.info(`Unknown preset: ${preset}`);
		}
	}

	private calculateEfficiency(): number {
		if (!this.lightState.on || this.lightState.powerConsumption === 0) {
			return 0;
		}
		// Lumens per watt (LED efficiency)
		return Math.round(
			(this.lightState.brightness * 100) / this.lightState.powerConsumption,
		);
	}

	private rgbToHex(color: { r: number; g: number; b: number }): string {
		return `#${color.r.toString(16).padStart(2, "0")}${color.g.toString(16).padStart(2, "0")}${color.b.toString(16).padStart(2, "0")}`;
	}

	// Public getters
	public isOn(): boolean {
		return this.lightState.on;
	}

	public getBrightness(): number {
		return this.lightState.brightness;
	}

	public getColor(): { r: number; g: number; b: number } | undefined {
		return this.lightState.color ? { ...this.lightState.color } : undefined;
	}

	public getColorTemperature(): number | undefined {
		return this.lightState.colorTemperature;
	}

	public getPowerConsumption(): number {
		return this.lightState.powerConsumption;
	}

	public supportsColorChanges(): boolean {
		return this.supportsColor;
	}

	public getLightState(): LightState {
		return { ...this.lightState };
	}
}
