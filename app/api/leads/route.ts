import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/security/rate-limit";

const requirementTypes = ["规范检索", "项目资料问答", "签证处理", "结算审核", "本地部署咨询"] as const;

const leadSchema = z.object({
  contactName: z.string().min(2, "请填写联系人"),
  contactMethod: z.string().min(6, "请填写有效联系方式"),
  email: z.string().email("邮箱格式不正确"),
  demand: z.string().min(8, "请补充具体需求，至少 8 个字").max(1500, "需求内容过长"),
  requirementType: z.enum(requirementTypes),
  website: z.string().optional().default("")
});

function getClientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ message: "请求数据格式错误" }, { status: 400 });
  }

  const parsed = leadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "参数错误" }, { status: 400 });
  }

  const ip = getClientIp(request);
  const userAgent = request.headers.get("user-agent") ?? "unknown";

  const rateResult = checkRateLimit(`${ip}:${userAgent.slice(0, 80)}`, {
    windowMs: 10 * 60 * 1000,
    maxRequests: 5,
    minIntervalMs: 8 * 1000
  });

  if (!rateResult.allowed) {
    return NextResponse.json(
      { message: "提交过于频繁，请稍后再试。" },
      {
        status: 429,
        headers: {
          "Retry-After": `${Math.ceil(rateResult.retryAfterMs / 1000)}`
        }
      }
    );
  }

  if (parsed.data.website) {
    // 蜜罐命中：伪装成功，避免机器人重试。
    return NextResponse.json({ message: "提交成功，我们会尽快联系你。" });
  }

  try {
    await prisma.lead.create({
      data: {
        companyName: "内部试用线索",
        contactName: parsed.data.contactName,
        phone: parsed.data.contactMethod,
        wechat: null,
        email: parsed.data.email,
        demand: parsed.data.demand,
        sourcePage: "/trial",
        status: "NEW",
        note: `需求类型：${parsed.data.requirementType}`
      }
    });
  } catch {
    return NextResponse.json({ message: "提交失败，请稍后重试。" }, { status: 500 });
  }

  return NextResponse.json({ message: "提交成功。我们将在 1 个工作日内安排内部试用或本地部署咨询对接。" });
}
