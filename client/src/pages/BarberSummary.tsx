import { useParams } from "wouter";
import BarberSummaryContent from "./BarberSummaryContent";

export default function BarberSummary() {
  const { id } = useParams<{ id: string }>();
  return <BarberSummaryContent barberId={parseInt(id)} backPath="/barbers" showPayControls />;
}
