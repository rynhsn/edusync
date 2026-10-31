import { UnitPlanView } from '../../../unit-plan-view';

export default async function UnitPlanPage({ params }: PageProps<'/account/units/[schoolId]/plan'>) {
  const { schoolId } = await params;
  return <UnitPlanView schoolId={schoolId} />;
}
