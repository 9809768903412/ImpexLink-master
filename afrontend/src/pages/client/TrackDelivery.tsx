import { Navigate } from 'react-router-dom';

export default function TrackDeliveryPage() {
  return <Navigate to="/client/orders?tab=my-deliveries" replace />;
}
