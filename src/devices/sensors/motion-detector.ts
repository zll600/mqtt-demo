import type { MqttConfig } from "../../config/mqtt-config.js";
import logger from "../../utils/logger.js";
import { BaseDevice } from "../base-device.js";

interface MotionEvent {
	detected: boolean;
	confidence: number;
	zone?: string;
	duration?: number; // in milliseconds
}

export class MotionDetector extends BaseDevice {
	private motionState: boolean = false;
	private lastMotionTime: Date = new Date(0);
	private motionTimeout: NodeJS.Timeout | null = null;
	private sensitivity: number = 0.8; // 0-1, higher = more sensitive
	private zones: string[] = ["entrance", "center", "window"];

	constructor(
		room: string,
		name: string,
		config: MqttConfig,
		deviceId?: string,
	) {
		super("motion-detector", room, name, config, deviceId);
	}

	protected async publishData(): Promise<void> {
		// Simulate random motion detection based on realistic patterns
		const shouldDetectMotion = this.simulateMotionDetection();

		if (shouldDetectMotion && !this.motionState) {
			await this.triggerMotionDetection();
		} else if (!shouldDetectMotion && this.motionState) {
			await this.clearMotionDetection();
		}

		// Always publish current state
		await this.publishMotionState();
	}

	protected handleCommand(topic: string, payload: any): void {
		logger.info(
			{
				topic,
				payload,
			},
			`Motion detector ${this.deviceId} received command:`,
		);

		if (payload.command) {
			switch (payload.command) {
				case "setSensitivity":
					if (
						typeof payload.sensitivity === "number" &&
						payload.sensitivity >= 0 &&
						payload.sensitivity <= 1
					) {
						this.setSensitivity(payload.sensitivity);
					}
					break;
				case "test":
					this.performTestDetection();
					break;
				case "calibrate":
					this.calibrateDetector();
					break;
				case "reset":
					this.resetDetector();
					break;
				default:
					logger.info(`Unknown command: ${payload.command}`);
			}
		}
	}

	protected getDeviceInfo(): Record<string, any> {
		return {
			motionDetected: this.motionState,
			lastMotionTime: this.lastMotionTime.toISOString(),
			sensitivity: this.sensitivity,
			detectionZones: this.zones,
			timeSinceLastMotion: Date.now() - this.lastMotionTime.getTime(),
		};
	}

	private simulateMotionDetection(): boolean {
		const now = new Date();
		const hour = now.getHours();

		// Base probability of motion detection
		let baseProbability = 0.02; // 2% chance per check

		// Adjust probability based on time of day (people are more active during day)
		if (hour >= 7 && hour <= 22) {
			baseProbability *= 3; // 6% chance during active hours
		} else if (hour >= 23 || hour <= 6) {
			baseProbability *= 0.5; // 1% chance during sleep hours
		}

		// Adjust for room type (living room vs bathroom vs bedroom)
		if (
			this.room.toLowerCase().includes("living") ||
			this.room.toLowerCase().includes("kitchen")
		) {
			baseProbability *= 2;
		} else if (
			this.room.toLowerCase().includes("bedroom") ||
			this.room.toLowerCase().includes("bathroom")
		) {
			baseProbability *= 0.7;
		}

		// Apply sensitivity
		baseProbability *= this.sensitivity;

		// If motion was recently detected, reduce probability (people don't constantly move)
		const timeSinceLastMotion = Date.now() - this.lastMotionTime.getTime();
		if (timeSinceLastMotion < 30000) {
			// Less than 30 seconds
			baseProbability *= 0.1;
		}

		return Math.random() < baseProbability;
	}

	private async triggerMotionDetection(): Promise<void> {
		this.motionState = true;
		this.lastMotionTime = new Date();

		// Randomly select detection zone
		const detectedZone =
			this.zones[Math.floor(Math.random() * this.zones.length)];
		const confidence = 0.7 + Math.random() * 0.3; // 70-100% confidence

		const motionEvent: MotionEvent = {
			detected: true,
			confidence: parseFloat(confidence.toFixed(2)),
			zone: detectedZone,
		};

		// Publish motion detected with QoS 1 (important security event)
		await this.publish("motion", motionEvent, 1);
		await this.publish(
			"event",
			{
				type: "motion_detected",
				zone: detectedZone,
				confidence: motionEvent.confidence,
				timestamp: this.lastMotionTime.toISOString(),
			},
			1,
		);

		// Set timeout to clear motion after random duration (5-30 seconds)
		const motionDuration = 5000 + Math.random() * 25000;

		if (this.motionTimeout) {
			clearTimeout(this.motionTimeout);
		}

		this.motionTimeout = setTimeout(() => {
			this.clearMotionDetection();
		}, motionDuration);

		logger.info(
			`Motion detected in ${this.room} (${this.name}) - Zone: ${detectedZone}, Confidence: ${confidence.toFixed(2)}`,
		);
	}

	private async clearMotionDetection(): Promise<void> {
		if (!this.motionState) return;

		const motionDuration = Date.now() - this.lastMotionTime.getTime();
		this.motionState = false;

		const motionEvent: MotionEvent = {
			detected: false,
			confidence: 1.0,
			duration: motionDuration,
		};

		// Publish motion cleared
		await this.publish("motion", motionEvent, 0);
		await this.publish(
			"event",
			{
				type: "motion_cleared",
				duration: motionDuration,
				timestamp: new Date().toISOString(),
			},
			0,
		);

		if (this.motionTimeout) {
			clearTimeout(this.motionTimeout);
			this.motionTimeout = null;
		}

		logger.info(
			`Motion cleared in ${this.room} (${this.name}) - Duration: ${(motionDuration / 1000).toFixed(1)}s`,
		);
	}

	private async publishMotionState(): Promise<void> {
		await this.publish(
			"state",
			{
				motion: this.motionState,
				lastMotion: this.lastMotionTime.toISOString(),
				timeSinceLastMotion: Date.now() - this.lastMotionTime.getTime(),
			},
			0,
		);
	}

	private setSensitivity(sensitivity: number): void {
		this.sensitivity = Math.max(0, Math.min(1, sensitivity));

		this.publish(
			"config",
			{
				sensitivity: this.sensitivity,
				changed: new Date().toISOString(),
			},
			1,
			true,
		);

		logger.info(
			`Motion detector ${this.deviceId} sensitivity set to ${this.sensitivity}`,
		);
	}

	private async performTestDetection(): Promise<void> {
		logger.info(`Performing test detection for ${this.deviceId}`);

		await this.publish(
			"test",
			{
				testStarted: true,
				timestamp: new Date().toISOString(),
			},
			1,
		);

		// Trigger a test motion detection
		await this.triggerMotionDetection();

		// Clear it after 3 seconds
		setTimeout(() => {
			this.clearMotionDetection();
			this.publish(
				"test",
				{
					testCompleted: true,
					timestamp: new Date().toISOString(),
				},
				1,
			);
		}, 3000);
	}

	private calibrateDetector(): void {
		logger.info(`Calibrating motion detector ${this.deviceId}`);

		// Reset state and sensitivity to default
		this.motionState = false;
		this.sensitivity = 0.8;
		this.lastMotionTime = new Date(0);

		this.publish(
			"calibration",
			{
				calibrated: true,
				sensitivity: this.sensitivity,
				timestamp: new Date().toISOString(),
			},
			1,
		);
	}

	private resetDetector(): void {
		if (this.motionTimeout) {
			clearTimeout(this.motionTimeout);
			this.motionTimeout = null;
		}

		this.motionState = false;
		this.sensitivity = 0.8;
		this.lastMotionTime = new Date(0);

		this.publish(
			"reset",
			{
				reset: true,
				timestamp: new Date().toISOString(),
			},
			1,
		);
	}

	// Public getters
	public isMotionDetected(): boolean {
		return this.motionState;
	}

	public getLastMotionTime(): Date {
		return new Date(this.lastMotionTime);
	}

	public getSensitivity(): number {
		return this.sensitivity;
	}

	public getDetectionZones(): string[] {
		return [...this.zones];
	}
}
