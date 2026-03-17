import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminLoginForm } from "@/components/admin/login-form";
import { isAdminAuthenticated } from "@/lib/auth";

export const metadata: Metadata = {
  title: "后台登录",
  description: "管理员登录页面"
};

export default function AdminLoginPage() {
  if (isAdminAuthenticated()) {
    redirect("/admin");
  }

  return (
    <div className="py-10">
      <AdminLoginForm />
    </div>
  );
}
