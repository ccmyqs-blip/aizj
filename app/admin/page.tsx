import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { isAdminAuthenticated } from "@/lib/auth";
import { FEEDBACK_STATUSES, LEAD_STATUSES, type FeedbackStatusValue, type LeadStatusValue } from "@/lib/constants/status";
import { startDocumentIngestWorker } from "@/lib/document-upload-queue";
import { prisma } from "@/lib/prisma";
import { getClientIp } from "@/lib/request-ip";
import { logSecurityEvent } from "@/lib/security-log";

export const metadata: Metadata = {
  title: "后台管理",
  description: "留资、反馈、问答日志与规范数据统计管理。"
};

function parseSourceChunkCount(sourceChunkIds: string | null) {
  if (!sourceChunkIds) {
    return 0;
  }

  try {
    const parsed = JSON.parse(sourceChunkIds) as unknown;
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

function normalizeLeadStatus(status: string): LeadStatusValue {
  if ((LEAD_STATUSES as readonly string[]).includes(status)) {
    return status as LeadStatusValue;
  }
  return "NEW";
}

function normalizeFeedbackStatus(status: string): FeedbackStatusValue {
  if ((FEEDBACK_STATUSES as readonly string[]).includes(status)) {
    return status as FeedbackStatusValue;
  }
  return "NEW";
}

function estimateTextTokens(text: string) {
  const cjkCount = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const asciiWordCount = (text.match(/[A-Za-z0-9_]+/g) ?? []).length;
  const otherCount = Math.max(0, text.length - cjkCount);
  return Math.max(1, Math.round(cjkCount + asciiWordCount * 1.3 + otherCount * 0.3));
}

export default async function AdminPage() {
  if (!isAdminAuthenticated()) {
    const requestHeaders = headers();
    const ip = getClientIp({ headers: requestHeaders });
    const userAgent = requestHeaders.get("user-agent") ?? "";

    logSecurityEvent({
      eventType: "ADMIN_ACCESS_BLOCKED",
      ip,
      userAgent,
      path: "/admin",
      detail: "unauthenticated access"
    });

    redirect("/admin/login");
  }

  await startDocumentIngestWorker().catch(() => undefined);

  const [
    leads,
    qaRecords,
    feedbacks,
    uploadedDocuments,
    uploadedDocumentCount,
    uploadedChunkCount,
    uploadedQualityRows,
    uploadedNoChunkCount
  ] = await prisma.$transaction([
    prisma.lead.findMany({
      orderBy: {
        createdAt: "desc"
      },
      take: 80,
      select: {
        id: true,
        contactName: true,
        phone: true,
        email: true,
        demand: true,
        sourcePage: true,
        status: true,
        note: true,
        createdAt: true
      }
    }),
    prisma.qARecord.findMany({
      orderBy: {
        createdAt: "desc"
      },
      take: 80,
      select: {
        id: true,
        question: true,
        answer: true,
        sourceChunkIds: true,
        modelName: true,
        createdAt: true
      }
    }),
    prisma.feedback.findMany({
      orderBy: {
        createdAt: "desc"
      },
      take: 80,
      select: {
        id: true,
        feedbackType: true,
        sourcePage: true,
        content: true,
        contact: true,
        rating: true,
        status: true,
        note: true,
        createdAt: true,
        updatedAt: true
      }
    }),
    prisma.document.findMany({
      where: {
        source: {
          startsWith: "/uploads/documents/"
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 20,
      select: {
        id: true,
        title: true,
        code: true,
        category: true,
        source: true,
        status: true,
        createdAt: true
      }
    }),
    prisma.document.count({
      where: {
        source: {
          startsWith: "/uploads/documents/"
        }
      }
    }),
    prisma.documentChunk.count({
      where: {
        document: {
          source: {
            startsWith: "/uploads/documents/"
          }
        }
      }
    }),
    prisma.document.findMany({
      where: {
        source: {
          startsWith: "/uploads/documents/"
        }
      },
      select: {
        status: true,
        ingestStage: true,
        textCoverage: true,
        ocrUsed: true
      }
    }),
    prisma.document.count({
      where: {
        source: {
          startsWith: "/uploads/documents/"
        },
        chunks: {
          none: {}
        }
      }
    })
  ]);

  const qualityTotal = uploadedQualityRows.length;
  const qualityActive = uploadedQualityRows.filter((item) => item.status === "ACTIVE" && item.ingestStage === "COMPLETED").length;
  const qualityFailed = uploadedQualityRows.filter((item) => item.status === "FAILED" || item.ingestStage === "FAILED").length;
  const qualityProcessing = uploadedQualityRows.filter((item) =>
    item.status === "PROCESSING" || ["EXTRACTING", "CHUNKING", "EMBEDDING"].includes(item.ingestStage)
  ).length;
  const avgTextCoverage =
    qualityTotal > 0
      ? uploadedQualityRows.reduce((sum, item) => sum + (Number.isFinite(item.textCoverage) ? item.textCoverage : 0), 0) / qualityTotal
      : 0;
  const ocrHitRate = qualityTotal > 0 ? uploadedQualityRows.filter((item) => item.ocrUsed).length / qualityTotal : 0;

  const serializedLeads = leads.map((item) => ({
    id: item.id,
    contactName: item.contactName,
    phone: item.phone,
    email: item.email,
    demand: item.demand,
    sourcePage: item.sourcePage,
    status: normalizeLeadStatus(item.status),
    note: item.note,
    createdAt: item.createdAt.toISOString()
  }));

  const serializedQaRecords = qaRecords.map((item) => ({
    id: item.id,
    question: item.question,
    answer: item.answer,
    modelName: item.modelName,
    createdAt: item.createdAt.toISOString(),
    sourceChunkCount: parseSourceChunkCount(item.sourceChunkIds)
  }));

  const qaModelStatsMap = new Map<string, { modelName: string; callCount: number; approxTokens: number }>();
  for (const record of serializedQaRecords) {
    const modelName = record.modelName || "unknown";
    const estimated = estimateTextTokens(record.question) + estimateTextTokens(record.answer);
    const prev = qaModelStatsMap.get(modelName);
    if (prev) {
      prev.callCount += 1;
      prev.approxTokens += estimated;
    } else {
      qaModelStatsMap.set(modelName, {
        modelName,
        callCount: 1,
        approxTokens: estimated
      });
    }
  }
  const qaModelStats = Array.from(qaModelStatsMap.values()).sort((a, b) => b.callCount - a.callCount);

  const serializedFeedbacks = feedbacks.map((item) => ({
    id: item.id,
    feedbackType: item.feedbackType,
    sourcePage: item.sourcePage,
    content: item.content,
    contact: item.contact,
    rating: item.rating,
    status: normalizeFeedbackStatus(item.status),
    note: item.note,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString()
  }));

  const serializedUploadedDocuments = uploadedDocuments.map((item) => ({
    id: item.id,
    title: item.title,
    code: item.code,
    category: item.category,
    source: item.source,
    status: item.status,
    createdAt: item.createdAt.toISOString()
  }));

  return (
    <div className="space-y-6">
      <section className="panel flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h1 className="section-title">后台管理</h1>
          <p className="section-subtitle">轻量管理控制台：留资、反馈、问答日志、文档统计</p>
        </div>
        <form action="/api/admin/logout" method="post">
          <button
            type="submit"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 transition hover:border-brand-600 hover:text-brand-700"
          >
            退出登录
          </button>
        </form>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <article className="panel p-4">
          <p className="text-xs text-slate-500">规范文档数</p>
          <p className="mt-2 text-2xl font-semibold text-brand-900">{uploadedDocumentCount}</p>
        </article>
        <article className="panel p-4">
          <p className="text-xs text-slate-500">条款切片数</p>
          <p className="mt-2 text-2xl font-semibold text-brand-900">{uploadedChunkCount}</p>
        </article>
        <article className="panel p-4">
          <p className="text-xs text-slate-500">留资线索数</p>
          <p className="mt-2 text-2xl font-semibold text-brand-900">{serializedLeads.length}</p>
        </article>
        <article className="panel p-4">
          <p className="text-xs text-slate-500">反馈留言数</p>
          <p className="mt-2 text-2xl font-semibold text-brand-900">{serializedFeedbacks.length}</p>
        </article>
      </section>

      <section className="grid gap-4 md:grid-cols-5">
        <article className="panel p-4">
          <p className="text-xs text-slate-500">质量状态 ACTIVE</p>
          <p className="mt-2 text-2xl font-semibold text-emerald-700">{qualityActive}</p>
        </article>
        <article className="panel p-4">
          <p className="text-xs text-slate-500">质量状态 FAILED</p>
          <p className="mt-2 text-2xl font-semibold text-rose-700">{qualityFailed}</p>
        </article>
        <article className="panel p-4">
          <p className="text-xs text-slate-500">质量状态 PROCESSING</p>
          <p className="mt-2 text-2xl font-semibold text-amber-700">{qualityProcessing}</p>
        </article>
        <article className="panel p-4">
          <p className="text-xs text-slate-500">平均 textCoverage</p>
          <p className="mt-2 text-2xl font-semibold text-brand-900">{(avgTextCoverage * 100).toFixed(1)}%</p>
          <p className="mt-1 text-[11px] text-slate-500">无 chunk 文档: {uploadedNoChunkCount}</p>
        </article>
        <article className="panel p-4">
          <p className="text-xs text-slate-500">OCR 命中率</p>
          <p className="mt-2 text-2xl font-semibold text-brand-900">{(ocrHitRate * 100).toFixed(1)}%</p>
        </article>
      </section>

      <AdminDashboard
        leads={serializedLeads}
        qaRecords={serializedQaRecords}
        feedbacks={serializedFeedbacks}
        qaModelStats={qaModelStats}
        uploadedDocuments={serializedUploadedDocuments}
      />
    </div>
  );
}
