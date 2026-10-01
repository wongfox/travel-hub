import { useTranslation } from "react-i18next";
import { buildWhatsAppDeepLink } from "./whatsapp-config.js";

/**
 * `help-center`'s WhatsApp deep-link contact (task 9.2, spec "WhatsApp button
 * opens a chat"). The sole contact mechanism in this feature — deliberately
 * no form, textarea, or other escalation control (spec "No in-app chat,
 * chatbot, or general escalation").
 */
export function WhatsAppButton() {
  const { t } = useTranslation();

  return (
    <a href={buildWhatsAppDeepLink()} target="_blank" rel="noreferrer">
      {t("help.whatsapp")}
    </a>
  );
}
