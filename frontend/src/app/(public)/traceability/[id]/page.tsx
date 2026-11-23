import type { Metadata } from "next";
import TraceabilityClient from "./traceability-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_URL) {
  throw new Error(
    "Production API configuration error: NEXT_PUBLIC_API_URL is required.",
  );
}

async function getTraceability(traceabilityId: string) {
  try {
    const batchResponse = await fetch(
      `${API_URL}/api/v1/traceability/batch/${traceabilityId}`,
      { cache: "no-store" },
    );
    if (batchResponse.ok) {
      const json = await batchResponse.json();
      return json.data ?? null;
    }
    const res = await fetch(
      `${API_URL}/api/v1/traceability/${traceabilityId}`,
      {
        cache: "no-store",
      },
    );
    if (!res.ok) return null;
    const json = await res.json();
    return json.data ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const data = await getTraceability(id);
  const product = data?.product;
  const title = product
    ? `Truy xuất nguồn gốc ${product.name}`
    : "Truy xuất nguồn gốc OCOP";
  const description = product
    ? `Xem hành trình sản xuất, chứng nhận, lô hàng và kho hiện tại của ${product.name}.`
    : "Tra cứu hành trình sản phẩm OCOP bằng mã QR.";
  const image = product?.images?.[0];

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images: image ? [{ url: image }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function TraceabilityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getTraceability(id);
  const jsonLd = data?.product
    ? {
        "@context": "https://schema.org",
        "@type": "Product",
        name: data.product.name,
        description: data.product.description,
        image: data.product.images ?? [],
        brand: { "@type": "Brand", name: data.seller?.name ?? "OCOP" },
        category: data.product.category?.name,
        additionalProperty: [
          {
            "@type": "PropertyValue",
            name: "OCOP Rating",
            value: data.product.ocopLevel?.title,
          },
          {
            "@type": "PropertyValue",
            name: "Traceability Code",
            value: data.product.code,
          },
        ],
      }
    : null;

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
        />
      )}
      <TraceabilityClient productId={id} initialData={data} />
    </>
  );
}
