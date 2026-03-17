export type VerifyCaptchaInput = {
  captchaToken: string;
  ip: string;
  userAgent: string;
  path: string;
};

export type VerifyCaptchaResult = {
  ok: boolean;
  message?: string;
};

export function isCaptchaEnabled() {
  return process.env.CAPTCHA_ENABLED === "true";
}

/**
 * Mock verifier for MVP.
 * Replace this function body with Aliyun or any external captcha provider later.
 */
export async function verifyCaptcha(input: VerifyCaptchaInput): Promise<VerifyCaptchaResult> {
  if (!isCaptchaEnabled()) {
    return { ok: true };
  }

  const token = input.captchaToken.trim();
  if (!token) {
    return { ok: false, message: "Captcha is required" };
  }

  const mockPassToken = process.env.CAPTCHA_MOCK_PASS_TOKEN?.trim() || "mock-pass";
  if (token !== mockPassToken) {
    return { ok: false, message: "Captcha verification failed" };
  }

  return { ok: true };
}
