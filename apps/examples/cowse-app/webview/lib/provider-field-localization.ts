import type { ProviderConfigField } from "./provider-schema";
const LABELS: Readonly<Record<string, string>> = {
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
};
const COPY: Readonly<Record<string, string>> = {
	"API key issued by the provider.": "供应商提供的 API 密钥。",
	"Base endpoint used for provider requests.": "用于发送供应商请求的基础地址。",
	"Google Cloud project that owns the Vertex AI resources.":
		"Vertex AI 资源所属的 Google Cloud 项目。",
	"Vertex AI location to run models in.": "运行 Vertex AI 模型的区域。",
	"Optional Google API key for Gemini models. Vertex Anthropic models use Google Cloud credentials.":
		"可选的 Google API 密钥，用于 Gemini 模型。Vertex Anthropic 模型使用 Google Cloud 凭据。",
	"Credential source for Amazon Bedrock requests.":
		"Amazon Bedrock 请求使用的凭据来源。",
	"AWS region for Bedrock runtime requests.":
		"Bedrock 运行时请求使用的 AWS 区域。",
	"Named AWS profile when using profile authentication.":
		"使用配置档认证时指定的 AWS 配置档名称。",
	"Optional Bedrock bearer token for API key authentication.":
		"可选的 Bedrock Bearer 令牌，用于 API 密钥认证。",
	"Optional custom Bedrock runtime endpoint.":
		"可选的自定义 Bedrock 运行时端点。",
	"Regional API line for Qwen routing.": "Qwen 路由使用的区域 API 线路。",
	"Required for Azure AI Foundry deployment URLs.":
		"使用 Azure AI Foundry 部署 URL 时必填。",
	"Leave blank to use Google Cloud credentials": "留空以使用 Google Cloud 凭据",
	"Leave blank to use AWS profile/default chain":
		"留空以使用 AWS 配置档或默认凭据链",
	"Keep empty if no API key for local inference.":
		"本地推理无需 API 密钥时请留空。",
	"Enter API key...": "输入 API 密钥…",
	"SAP AI Core client secret": "SAP AI Core 客户端密钥",
	"SAP AI Core deployment id": "SAP AI Core 部署 ID",
};
/** Presentation only; never mutate schema, values, options or credential paths. */
export function localizeConfigField(field: ProviderConfigField): {
	label: string;
	description?: string;
	placeholder?: string;
} {
	const known = LABELS[field.path];
	let label = known ?? field.label;
	if (field.path === "apiKey" && field.label.includes("Bedrock"))
		label = "AWS Bedrock API 密钥";
	if (known && /\(optional\)/i.test(field.label)) label += "（可选）";
	return {
		label,
		description:
			field.description === undefined
				? field.path === "apiKey"
					? "供应商提供的 API 密钥。"
					: field.path === "baseUrl"
						? "用于发送供应商请求的基础地址。"
						: undefined
				: (COPY[field.description] ?? field.description),
		placeholder:
			field.placeholder === undefined
				? field.path === "apiKey"
					? "输入 API 密钥…"
					: undefined
				: (COPY[field.placeholder] ?? field.placeholder),
	};
}
