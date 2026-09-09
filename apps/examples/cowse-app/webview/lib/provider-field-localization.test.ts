import { expect, it } from "vitest";
import { localizeConfigField } from "./provider-field-localization";
import type { ProviderConfigField } from "./provider-schema";
it("translates advanced paths without changing schema, defaults or option values", () => {
	for (const [path, label] of Object.entries({
		apiKey: "API 密钥",
		baseUrl: "Base URL",
		azureApiVersion: "Azure API 版本",
		"azure.apiVersion": "Azure API 版本",
		gcpProjectId: "Google Cloud 项目 ID",
		"gcp.projectId": "Google Cloud 项目 ID",
		gcpRegion: "Google Cloud 区域",
		"gcp.region": "Vertex 区域",
		awsRegion: "AWS 区域",
		"aws.region": "AWS 区域",
		awsProfile: "AWS 配置档名称",
		"aws.profile": "AWS 配置档",
		"aws.authentication": "认证方式",
		"aws.accessKey": "访问密钥 ID",
		"aws.secretKey": "秘密访问密钥",
		"aws.sessionToken": "会话令牌",
		"aws.endpoint": "端点 URL",
		"aws.useCrossRegionInference": "跨区域推理",
		"aws.useGlobalInference": "全局推理",
		"aws.usePromptCache": "提示词缓存",
		"oca.mode": "OCA 模式",
		"oca.usePromptCache": "提示词缓存",
		apiLine: "API 线路",
		sapClientId: "客户端 ID",
		sapClientSecret: "客户端密钥",
		sapTokenUrl: "令牌 URL",
		sapResourceGroup: "资源组",
		sapDeploymentId: "部署 ID",
	})) {
		const field: ProviderConfigField = {
			path,
			label: "Original",
			type: "text",
			placeholder: "us-east-1",
			defaultValue: "original",
			options: [{ label: "AWS SDK / IAM", value: "iam" }],
		};
		const before = JSON.stringify(field);
		expect(localizeConfigField(field).label).toBe(label);
		expect(localizeConfigField(field).placeholder).toBe("us-east-1");
		expect(JSON.stringify(field)).toBe(before);
	}
});
it("preserves optional authentication guidance and unknown descriptions", () => {
	expect(
		localizeConfigField({
			path: "apiKey",
			type: "password",
			label: "AWS Bedrock API Key (optional)",
			placeholder: "Leave blank to use AWS profile/default chain",
		}),
	).toMatchObject({
		label: "AWS Bedrock API 密钥（可选）",
		placeholder: "留空以使用 AWS 配置档或默认凭据链",
	});
	const field: ProviderConfigField = {
		path: "custom.setting",
		type: "text",
		label: "Custom label",
		description: "Third-party instructions",
		placeholder: "https://example.com/v1",
	};
	expect(localizeConfigField(field)).toEqual({
		label: field.label,
		description: field.description,
		placeholder: field.placeholder,
	});
});
