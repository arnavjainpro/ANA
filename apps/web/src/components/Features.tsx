import FeatureRow from './FeatureRow';
import UnderstandMockup from './mockups/UnderstandMockup';
import PlanMockup from './mockups/PlanMockup';
import SpeedMockup from './mockups/SpeedMockup';
import BuildMockup from './mockups/BuildMockup';

export default function Features() {
  return (
    <div id="features">
      <FeatureRow
        eyebrow="Understand"
        title="See how your product actually works"
        body="Ask Ana anything about your repo and watch a live architecture diagram light up as she explains. No more guessing what the code your team shipped actually does."
        linkLabel="Learn more"
        mockup={<UnderstandMockup />}
      />
      <FeatureRow
        eyebrow="Plan"
        title="From idea to user stories in one conversation"
        body="Describe the feature you want in plain language. Ana turns it into user stories, acceptance criteria, and a task breakdown you can review together — before a single line is written."
        linkLabel="Learn more"
        mockup={<PlanMockup />}
        reverse
      />
      <FeatureRow
        eyebrow="Real-time voice"
        title="Talk. Ana answers in under a second."
        accentWord="second"
        body="Under 1000ms from your voice to Ana's reply, end to end. It feels like a conversation, not a chatbot. And your repo never trains anyone's model."
        linkLabel="Learn more"
        mockup={<SpeedMockup />}
        dark
      />
      <FeatureRow
        eyebrow="Build"
        title="Watch changes appear. Accept or reject every line."
        body="Ana writes code directly into your local working copy as diff patches. You stay in control — approve each change, or undo the whole thing with one word."
        linkLabel="Learn more"
        mockup={<BuildMockup />}
        reverse
      />
      <FeatureRow
        id="pricing"
        eyebrow="Ana for Teams"
        title="Give your whole team a technical partner"
        body="Founders, PMs, and designers ship without waiting on engineering cycles. Ana keeps everyone fluent in the codebase, so ideas move from meeting to merged."
        linkLabel="Ana for Teams"
        mockup={<UnderstandMockup />}
      />
    </div>
  );
}
