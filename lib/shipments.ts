type DocumentType = {
  id: string;
  name: string;
  is_required: boolean | null;
  is_critical: boolean | null;
  applies_to?: string | null;
};

type DocumentItem = {
  document_type_id: string | null;
  status: string | null;
};

const toDateOnly = (value: Date) =>
  new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));

export function getShipmentFlags(
  shipment: {
    eta_current: string | null;
    warehouse_delivery_date: string | null;
  },
  documents: DocumentItem[],
  documentTypes: DocumentType[]
) {
  const today = toDateOnly(new Date());
  const etaDate = shipment.eta_current
    ? toDateOnly(new Date(shipment.eta_current))
    : null;
  const threeDaysLater = new Date(today);
  threeDaysLater.setUTCDate(today.getUTCDate() + 3);

  const shipmentTypes = documentTypes.filter(
    (type) => type.applies_to === "shipment" || !type.applies_to
  );
  const requiredTypes = shipmentTypes.filter((type) => type.is_required);
  const blType = shipmentTypes.find((type) => type.name === "BL");

  const missingRequired = requiredTypes.filter((type) => {
    const hasReceived = documents.some(
      (doc) => doc.document_type_id === type.id && doc.status === "Geldi"
    );
    return !hasReceived;
  });

  const hasProblematic = documents.some((doc) => doc.status === "Sorunlu");
  const blMissing = blType
    ? !documents.some(
        (doc) =>
          doc.document_type_id === blType.id && doc.status === "Geldi"
      )
    : false;

  const etaApproaching =
    etaDate !== null &&
    etaDate.getTime() >= today.getTime() &&
    etaDate.getTime() <= threeDaysLater.getTime();

  const overdue =
    etaDate !== null &&
    etaDate.getTime() <= today.getTime() &&
    !shipment.warehouse_delivery_date;

  let risk = "Normal";
  if (overdue) {
    risk = "Kritik";
  } else if ((etaApproaching && blMissing) || hasProblematic) {
    risk = "Uyari";
  }

  return {
    risk,
    overdue,
    etaApproaching,
    missingRequiredCount: missingRequired.length,
    hasProblematic,
    blMissing,
  };
}
