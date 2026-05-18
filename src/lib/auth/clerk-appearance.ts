const fontFamily =
  "OpenAI Sans, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";

export const storeForgeClerkAppearance = {
  variables: {
    borderRadius: "0.75rem",
    colorBackground: "#ffffff",
    colorDanger: "#d32f2f",
    colorInputBackground: "#ffffff",
    colorInputText: "#0d0d0d",
    colorPrimary: "#000000",
    colorText: "#0d0d0d",
    colorTextOnPrimaryBackground: "#ffffff",
    colorTextSecondary: "#505050",
    fontFamily,
    fontSize: "16px",
  },
  elements: {
    alert: "rounded-xl border border-[#e9ecef] bg-[#fafafa] text-[#0d0d0d]",
    alternativeMethodsBlockButton:
      "h-11 rounded-full border-[#e9ecef] text-[#0d0d0d] shadow-none hover:bg-[#f5f5f5]",
    card: "w-full border border-[#e9ecef] bg-white p-8 shadow-[0_1px_2px_rgba(0,0,0,0.06)] sm:rounded-xl",
    dividerLine: "bg-[#e9ecef]",
    dividerText: "text-[#505050]",
    footer: "bg-white",
    footerActionLink:
      "font-medium text-[#000000] underline-offset-4 hover:underline",
    formButtonPrimary:
      "h-11 rounded-full bg-black text-sm font-medium text-white shadow-none transition-colors hover:bg-[#1a1a1a] focus:shadow-[0_0_0_3px_rgba(0,0,0,0.08)]",
    formFieldAction:
      "font-medium text-[#000000] underline-offset-4 hover:underline",
    formFieldInput:
      "h-11 rounded-full border-[#adb5bd] bg-white px-5 text-[#0d0d0d] shadow-none focus:border-black focus:shadow-[0_0_0_3px_rgba(0,0,0,0.08)]",
    formFieldInputShowPasswordButton:
      "text-[#505050] hover:text-[#0d0d0d]",
    formFieldLabel: "text-sm font-medium text-[#0d0d0d]",
    headerSubtitle: "text-base leading-6 text-[#505050]",
    headerTitle: "text-[28px] font-semibold leading-9 tracking-normal text-[#0d0d0d]",
    identityPreview: "rounded-full border-[#e9ecef] bg-[#fafafa]",
    identityPreviewEditButton: "text-[#505050] hover:text-[#0d0d0d]",
    otpCodeFieldInput:
      "rounded-xl border-[#adb5bd] text-[#0d0d0d] focus:border-black focus:shadow-[0_0_0_3px_rgba(0,0,0,0.08)]",
    socialButtonsBlockButton:
      "h-11 rounded-full border-[#e9ecef] bg-[rgba(0,0,0,0.04)] text-[#0d0d0d] shadow-none transition-colors hover:bg-[#e0e0e0]",
    socialButtonsBlockButtonText: "text-sm font-medium text-[#0d0d0d]",
  },
  layout: {
    logoPlacement: "none",
    socialButtonsPlacement: "top",
  },
};
