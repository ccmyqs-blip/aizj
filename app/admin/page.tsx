import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { isAdminAuthenticated } from "@/lib/auth";
import { LEAD_STATUSES, type LeadStatusValue } from "@/lib/constants/status";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "后台管理",
  description: "留资、问答日志与规范数据统计管理。"
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

export default async function AdminPage() {
  if (!isAdminAuthenticated()) {
    redirect("/admin/login");
  }

  const [leads, qaRecords, documentCount, chunkCount] = await prisma.$transaction([
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
    prisma.document.count(),
    prisma.documentChunk.count()
  ]);

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

  return (
    <div className="space-y-6">
      <section className="panel flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h1 className="section-title">后台管理</h1>
          <p className="section-subtitle">轻量管理控制台：留资、问答日志、文档统计</p>
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

      <section className="grid gap-4 md:grid-cols-3">
        <article className="panel p-4">
          <p className="text-xs text-slate-500">规范文档数</p>
          <p className="mt-2 text-2xl font-semibold text-brand-900">{documentCount}</p>
        </article>
        <article className="panel p-4">
          <p className="text-xs text-slate-500">条款切片数</p>
          <p className="mt-2 text-2xl font-semibold text-brand-900">{chunkCount}</p>
        </article>
        <article className="panel p-4">
          <p className="text-xs text-slate-500">留资线索数</p>
          <p className="mt-2 text-2xl font-semibold text-brand-900">{serializedLeads.length}</p>
        </article>
      </section>

      <AdminDashboard leads={serializedLeads} qaRecords={serializedQaRecords} />
    </div>
  );
}
