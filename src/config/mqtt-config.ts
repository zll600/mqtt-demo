export interface MqttConfig {
	brokerUrl: string;
	clientId?: string;
	username?: string;
	password?: string;
	keepalive?: number;
	clean?: boolean;
	reconnectPeriod?: number;
	connectTimeout?: number;
}

export const defaultMqttConfig: MqttConfig = {
	brokerUrl: "mqtt://localhost:11883",
	keepalive: 60,
	clean: true,
	reconnectPeriod: 1000,
	connectTimeout: 30 * 1000,
};

export const webSocketConfig: MqttConfig = {
	brokerUrl: "ws://localhost:19001",
	keepalive: 60,
	clean: true,
	reconnectPeriod: 1000,
	connectTimeout: 30 * 1000,
};

export const authenticatedConfig: MqttConfig = {
	...defaultMqttConfig,
	username: "demo_user",
	password: "demo123",
};

export const controlCenterConfig: MqttConfig = {
	...defaultMqttConfig,
	username: "control_center",
	password: "control456",
};

export const topicStructure = {
	home: "home",
	status: "status",
	command: "command",
	separator: "/",
	wildcard: {
		single: "+",
		multi: "#",
	},
} as const;

export function buildTopic(...segments: string[]): string {
	return segments.join(topicStructure.separator);
}

export function buildHomeTopic(
	room: string,
	device: string,
	metric: string,
): string {
	return buildTopic(topicStructure.home, room, device, metric);
}

export function buildStatusTopic(deviceId: string): string {
	return buildTopic(topicStructure.home, topicStructure.status, deviceId);
}

export function buildCommandTopic(deviceId: string): string {
	return buildTopic(topicStructure.home, topicStructure.command, deviceId);
}
