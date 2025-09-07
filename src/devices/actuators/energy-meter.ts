import type { MqttConfig } from "../../config/mqtt-config.js";
import logger from "../../utils/logger.js";
import { BaseDevice } from "../base-device.js";

interface EnergyReading {
	instantPower: number; // Watts
	totalEnergy: number; // kWh
	voltage: number; // Volts
	current: number; // Amperes
	frequency: number; // Hz
	powerFactor: number; // 0-1
	cost: number; // Currency units
}

interface EnergyAlert {
	type:
		| "high_usage"
		| "low_usage"
		| "power_outage"
		| "voltage_spike"
		| "cost_threshold";
	value: number;
	threshold: number;
	severity: "low" | "medium" | "high";
}

export class EnergyMeter extends BaseDevice {
	private currentReading: EnergyReading;
	private costPerKwh: number = 0.12; // $0.12 per kWh
	private highUsageThreshold: number = 3000; // Watts
	private lowUsageThreshold: number = 50; // Watts
	private monthlyCostBudget: number = 150; // $150 per month
	private dailyUsage: { date: string; kwh: number }[] = [];
	private baseLoad: number = 200; // Base household load in watts

	constructor(
		room: string,
		name: string,
		config: MqttConfig,
		deviceId?: string,
	) {
		super("energy-meter", room, name, config, deviceId);

		this.currentReading = {
			instantPower: this.baseLoad,
			totalEnergy: Math.random() * 1000, // Random starting point
			voltage: 240,
			current: this.baseLoad / 240,
			frequency: 50,
			powerFactor: 0.95,
			cost: 0,
		};
	}

	protected async publishData(): Promise<void> {
		// Simulate realistic power consumption patterns
		this.simulateEnergyConsumption();

		// Update derived values
		this.updateDerivedValues();

		// Publish energy readings
		await this.publishEnergyReadings();

		// Check for alerts
		await this.checkForAlerts();

		// Update daily usage tracking
		this.updateDailyUsage();
	}

	protected handleCommand(topic: string, payload: any): void {
		logger.info(
			{
				topic,
				payload,
			},
			`Energy meter ${this.deviceId} received command:`,
		);

		if (payload.command) {
			switch (payload.command) {
				case "resetTotalEnergy":
					this.resetTotalEnergy();
					break;
				case "setCostPerKwh":
					if (typeof payload.rate === "number" && payload.rate > 0) {
						this.setCostPerKwh(payload.rate);
					}
					break;
				case "setHighUsageThreshold":
					if (typeof payload.threshold === "number" && payload.threshold > 0) {
						this.setHighUsageThreshold(payload.threshold);
					}
					break;
				case "setMonthlyCostBudget":
					if (typeof payload.budget === "number" && payload.budget > 0) {
						this.setMonthlyCostBudget(payload.budget);
					}
					break;
				case "getDailyUsage":
					this.publishDailyUsage();
					break;
				case "getMonthlyStats":
					this.publishMonthlyStats();
					break;
				case "calibrate":
					this.calibrateMeter();
					break;
				default:
					logger.info(`Unknown command: ${payload.command}`);
			}
		}
	}

	protected getDeviceInfo(): Record<string, any> {
		return {
			...this.currentReading,
			costPerKwh: this.costPerKwh,
			thresholds: {
				highUsage: this.highUsageThreshold,
				lowUsage: this.lowUsageThreshold,
				monthlyCostBudget: this.monthlyCostBudget,
			},
			dailyUsage: this.dailyUsage.slice(-7), // Last 7 days
		};
	}

	private simulateEnergyConsumption(): void {
		const hour = new Date().getHours();
		const dayOfWeek = new Date().getDay(); // 0 = Sunday

		// Base consumption pattern throughout the day
		let timeMultiplier = 1;

		if (hour >= 6 && hour <= 8) {
			// Morning peak
			timeMultiplier = 1.8;
		} else if (hour >= 18 && hour <= 21) {
			// Evening peak
			timeMultiplier = 2.2;
		} else if (hour >= 22 || hour <= 5) {
			// Night (lower consumption)
			timeMultiplier = 0.6;
		} else {
			// Regular day hours
			timeMultiplier = 1.2;
		}

		// Weekend vs weekday patterns
		if (dayOfWeek === 0 || dayOfWeek === 6) {
			// Weekend - more consistent usage throughout day
			timeMultiplier *= 1.1;
		}

		// Seasonal adjustments (simplified)
		const month = new Date().getMonth();
		if (month >= 11 || month <= 2) {
			// Winter - heating
			timeMultiplier *= 1.4;
		} else if (month >= 5 && month <= 8) {
			// Summer - cooling
			timeMultiplier *= 1.3;
		}

		// Calculate new power consumption
		const targetPower = this.baseLoad * timeMultiplier;

		// Add some randomness and smooth transitions
		const maxChange = 100; // Maximum change per reading
		const powerDifference = targetPower - this.currentReading.instantPower;
		const powerChange = Math.max(
			-maxChange,
			Math.min(maxChange, powerDifference * 0.1),
		);

		this.currentReading.instantPower = Math.max(
			50,
			this.currentReading.instantPower + powerChange,
		);

		// Add some random appliance switching
		if (Math.random() < 0.1) {
			// 10% chance
			const applianceLoad = this.getRandomApplianceLoad();
			this.currentReading.instantPower +=
				applianceLoad * (Math.random() > 0.5 ? 1 : -1);
			this.currentReading.instantPower = Math.max(
				50,
				this.currentReading.instantPower,
			);
		}
	}

	private updateDerivedValues(): void {
		// Update total energy (accumulate over time)
		const timeIntervalHours = 5 / 3600; // 5 seconds converted to hours
		const energyIncrement =
			(this.currentReading.instantPower * timeIntervalHours) / 1000; // Convert to kWh
		this.currentReading.totalEnergy += energyIncrement;

		// Update current based on power and voltage
		this.currentReading.current =
			this.currentReading.instantPower / this.currentReading.voltage;

		// Simulate slight voltage variations
		this.currentReading.voltage = 240 + (Math.random() - 0.5) * 10; // ±5V variation

		// Simulate frequency variations
		this.currentReading.frequency = 50 + (Math.random() - 0.5) * 0.2; // ±0.1Hz variation

		// Power factor varies with load type
		if (this.currentReading.instantPower > 1000) {
			this.currentReading.powerFactor = 0.85 + Math.random() * 0.1; // 0.85-0.95
		} else {
			this.currentReading.powerFactor = 0.9 + Math.random() * 0.08; // 0.9-0.98
		}

		// Calculate cost
		this.currentReading.cost =
			this.currentReading.totalEnergy * this.costPerKwh;
	}

	private async publishEnergyReadings(): Promise<void> {
		// Publish complete reading
		await this.publish("reading", this.currentReading, 0);

		// Publish individual metrics for easier consumption
		await this.publish(
			"power",
			{
				value: this.currentReading.instantPower,
				unit: "watts",
			},
			0,
		);

		await this.publish(
			"energy",
			{
				value: this.currentReading.totalEnergy,
				unit: "kwh",
				cost: this.currentReading.cost,
				costUnit: "USD",
			},
			0,
			true,
		); // Retain total energy

		await this.publish(
			"voltage",
			{
				value: this.currentReading.voltage,
				unit: "volts",
			},
			0,
		);

		await this.publish(
			"current",
			{
				value: this.currentReading.current,
				unit: "amperes",
			},
			0,
		);

		await this.publish(
			"frequency",
			{
				value: this.currentReading.frequency,
				unit: "hz",
			},
			0,
		);

		await this.publish(
			"power_factor",
			{
				value: this.currentReading.powerFactor,
			},
			0,
		);
	}

	private async checkForAlerts(): Promise<void> {
		const alerts: EnergyAlert[] = [];

		if (this.currentReading.instantPower > this.highUsageThreshold) {
			alerts.push({
				type: "high_usage",
				value: this.currentReading.instantPower,
				threshold: this.highUsageThreshold,
				severity:
					this.currentReading.instantPower > this.highUsageThreshold * 1.5
						? "high"
						: "medium",
			});
		}

		if (this.currentReading.instantPower < this.lowUsageThreshold) {
			alerts.push({
				type: "low_usage",
				value: this.currentReading.instantPower,
				threshold: this.lowUsageThreshold,
				severity: "medium",
			});
		}

		// Voltage spike alert
		if (
			this.currentReading.voltage > 250 ||
			this.currentReading.voltage < 220
		) {
			alerts.push({
				type: "voltage_spike",
				value: this.currentReading.voltage,
				threshold: 240,
				severity:
					Math.abs(this.currentReading.voltage - 240) > 15 ? "high" : "medium",
			});
		}

		// Monthly cost threshold alert
		const monthlyProjectedCost = this.calculateMonthlyProjectedCost();
		if (monthlyProjectedCost > this.monthlyCostBudget) {
			alerts.push({
				type: "cost_threshold",
				value: monthlyProjectedCost,
				threshold: this.monthlyCostBudget,
				severity:
					monthlyProjectedCost > this.monthlyCostBudget * 1.2
						? "high"
						: "medium",
			});
		}

		// Publish alerts
		for (const alert of alerts) {
			await this.publish(
				"alert",
				{
					...alert,
					timestamp: new Date().toISOString(),
				},
				1,
			); // QoS 1 for alerts
		}
	}

	private updateDailyUsage(): void {
		const today = new Date().toISOString().split("T")[0];
		const lastEntry = this.dailyUsage[this.dailyUsage.length - 1];

		if (!lastEntry || lastEntry.date !== today) {
			// New day
			this.dailyUsage.push({
				date: today,
				kwh: 0,
			});

			// Keep only last 30 days
			if (this.dailyUsage.length > 30) {
				this.dailyUsage = this.dailyUsage.slice(-30);
			}
		}

		// Update today's usage
		const timeIntervalHours = 5 / 3600;
		const energyIncrement =
			(this.currentReading.instantPower * timeIntervalHours) / 1000;
		this.dailyUsage[this.dailyUsage.length - 1].kwh += energyIncrement;
	}

	private getRandomApplianceLoad(): number {
		const appliances = [
			{ name: "Dishwasher", load: 1800 },
			{ name: "Washing Machine", load: 2000 },
			{ name: "Dryer", load: 3000 },
			{ name: "Oven", load: 2500 },
			{ name: "Electric Kettle", load: 1500 },
			{ name: "Vacuum Cleaner", load: 1200 },
			{ name: "Hair Dryer", load: 1000 },
			{ name: "Microwave", load: 800 },
			{ name: "TV", load: 150 },
			{ name: "Computer", load: 300 },
		];

		const randomAppliance =
			appliances[Math.floor(Math.random() * appliances.length)];
		return randomAppliance.load;
	}

	private calculateMonthlyProjectedCost(): number {
		const today = new Date();
		const daysInMonth = new Date(
			today.getFullYear(),
			today.getMonth() + 1,
			0,
		).getDate();
		const _dayOfMonth = today.getDate();

		if (this.dailyUsage.length === 0) return 0;

		const recentDailyUsage = this.dailyUsage.slice(-7); // Last 7 days
		const avgDailyUsage =
			recentDailyUsage.reduce((sum, day) => sum + day.kwh, 0) /
			recentDailyUsage.length;

		return avgDailyUsage * daysInMonth * this.costPerKwh;
	}

	private async publishDailyUsage(): Promise<void> {
		await this.publish(
			"daily_usage",
			{
				data: this.dailyUsage.slice(-7), // Last 7 days
				totalWeeklyKwh: this.dailyUsage
					.slice(-7)
					.reduce((sum, day) => sum + day.kwh, 0),
				averageDailyKwh:
					this.dailyUsage.slice(-7).reduce((sum, day) => sum + day.kwh, 0) /
					Math.min(7, this.dailyUsage.length),
			},
			1,
		);
	}

	private async publishMonthlyStats(): Promise<void> {
		const monthlyKwh = this.dailyUsage.reduce((sum, day) => sum + day.kwh, 0);
		const monthlyCost = monthlyKwh * this.costPerKwh;
		const projectedCost = this.calculateMonthlyProjectedCost();

		await this.publish(
			"monthly_stats",
			{
				totalKwh: monthlyKwh,
				totalCost: monthlyCost,
				projectedMonthlyKwh: projectedCost / this.costPerKwh,
				projectedMonthlyCost: projectedCost,
				averageDailyKwh: monthlyKwh / Math.max(1, this.dailyUsage.length),
				costPerKwh: this.costPerKwh,
				budget: this.monthlyCostBudget,
				budgetRemaining: Math.max(0, this.monthlyCostBudget - projectedCost),
			},
			1,
		);
	}

	private resetTotalEnergy(): void {
		this.currentReading.totalEnergy = 0;
		this.currentReading.cost = 0;
		this.dailyUsage = [];

		this.publish(
			"reset",
			{
				reset: true,
				timestamp: new Date().toISOString(),
			},
			1,
		);
	}

	private setCostPerKwh(rate: number): void {
		this.costPerKwh = rate;
		this.currentReading.cost =
			this.currentReading.totalEnergy * this.costPerKwh;

		this.publish(
			"config",
			{
				costPerKwh: this.costPerKwh,
				updated: new Date().toISOString(),
			},
			1,
			true,
		);
	}

	private setHighUsageThreshold(threshold: number): void {
		this.highUsageThreshold = threshold;

		this.publish(
			"config",
			{
				highUsageThreshold: this.highUsageThreshold,
				updated: new Date().toISOString(),
			},
			1,
			true,
		);
	}

	private setMonthlyCostBudget(budget: number): void {
		this.monthlyCostBudget = budget;

		this.publish(
			"config",
			{
				monthlyCostBudget: this.monthlyCostBudget,
				updated: new Date().toISOString(),
			},
			1,
			true,
		);
	}

	private calibrateMeter(): void {
		// Reset to known good values
		this.currentReading.voltage = 240;
		this.currentReading.frequency = 50;
		this.currentReading.powerFactor = 0.95;

		this.publish(
			"calibration",
			{
				calibrated: true,
				timestamp: new Date().toISOString(),
				values: {
					voltage: this.currentReading.voltage,
					frequency: this.currentReading.frequency,
					powerFactor: this.currentReading.powerFactor,
				},
			},
			1,
		);
	}

	// Public getters
	public getCurrentReading(): EnergyReading {
		return { ...this.currentReading };
	}

	public getCostPerKwh(): number {
		return this.costPerKwh;
	}

	public getDailyUsage(): { date: string; kwh: number }[] {
		return [...this.dailyUsage];
	}

	public getMonthlyProjectedCost(): number {
		return this.calculateMonthlyProjectedCost();
	}
}
