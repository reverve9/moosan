import PageTitle from '@/components/layout/PageTitle'
import SurveyForm from './sections/survey/SurveyForm'

export default function SurveyPage() {
  return (
    <section>
      <PageTitle
        title="만족도 조사"
        subtitle="Satisfaction Survey"
      />
      <SurveyForm />
    </section>
  )
}
