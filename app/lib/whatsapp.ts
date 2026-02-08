const WHATSAPP_API_URL = 'https://graph.facebook.com/v21.0';

interface WhatsAppTemplateComponent {
    type: 'header' | 'body' | 'button';
    parameters: Record<string, unknown>[];
}

interface SendTemplateParams {
    to: string;
    templateName: string;
    languageCode?: string;
    components?: WhatsAppTemplateComponent[];
}

/**
 * Sends a WhatsApp Template message using the Cloud API.
 * @param to Recipient phone number (e.g., "88017..." or "+88017...")
 * @param templateName The name of the template (e.g., "hello_world")
 * @param components Optional dynamic parameters for the template
 */
export async function sendWhatsAppMessage({
    to,
    templateName,
    languageCode = 'en_US',
    components
}: SendTemplateParams) {
    const token = process.env.WHATSAPP_API_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!token || !phoneId) {
        console.warn('WhatsApp credentials missing in .env. Skipping message.');
        return { success: false, error: 'Missing credentials' };
    }

    // Ensure phone number format (remove + if present, Meta usually expects digits)
    // The "to" field in the API usually expects the country code without '+', but typically works with it if cleaned.
    let cleanPhone = to.replace(/[^\d]/g, '');

    // Auto-fix Bangladesh numbers (if starts with 01, add 88)
    if (cleanPhone.startsWith('01') && cleanPhone.length === 11) {
        cleanPhone = '88' + cleanPhone;
    }

    try {
        const response = await fetch(`${WHATSAPP_API_URL}/${phoneId}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: cleanPhone,
                type: 'template',
                template: {
                    name: templateName,
                    language: { code: languageCode },
                    components: components || []
                }
            })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('WhatsApp API Error:', JSON.stringify(data, null, 2));
            return { success: false, error: data.error?.message || 'Unknown API Error' };
        }

        return { success: true, messageId: data.messages?.[0]?.id };

    } catch (error) {
        console.error('WhatsApp Send Exception:', error);
        return { success: false, error: 'Network or internal error' };
    }
}
