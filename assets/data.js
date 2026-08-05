/* ============================================================
   BODIED SJ · content data
   Real classes, coaches, pricing and quotes from bodiedsj.com.
   Never invent classes or coaches — PRODUCT.md rule.
   ============================================================ */

const STUDIO = {
  name: 'BODIED SJ',
  addr: '2293 Lincoln Ave, San Jose, CA 95125',
  phone: '(408) 337-2160',
  tel: 'tel:+14083372160',
  email: 'hello@bodiedsj.com',
  site: 'https://bodiedsj.com',
  maps: 'https://maps.google.com/?q=2293+Lincoln+Ave,+San+Jose,+CA',
};

const COACH_COLORS = {
  Valeria: { bg: 'var(--pink)', fg: 'var(--cream)' },
  Gabi: { bg: 'var(--royal)', fg: 'var(--cream)' },
  Bri: { bg: 'var(--teal)', fg: 'var(--on-bright)' },
  Kimber: { bg: 'var(--chartreuse)', fg: 'var(--on-bright)' },
};

const CLASSES = {
  'booty-abs': { lines: ['Booty', '& Abs'], color: 'c-pink', effort: 3,
    vibe: 'Reggaeton up loud. Your glutes will know about it mañana.',
    tags: ['Mat provided', 'Bring water', 'All levels'] },
  'full-body-hiit': { lines: ['Full Body', 'HIIT'], color: 'c-blue', effort: 4,
    vibe: 'Cardio and strength in one sweaty hour. The fan favorite.',
    tags: ['Bring water', 'Towel', 'All levels'] },
  'arms-abs': { lines: ['Arms', '& Abs'], color: 'c-chartreuse', effort: 3,
    vibe: 'Upper body day. Tank top season is every season here.',
    tags: ['Dumbbells provided', 'Bring water'] },
  'pilates-sculpt': { lines: ['Pilates', 'Sculpt'], color: 'c-teal', effort: 2,
    vibe: 'Slow burn, deep core, shaky legs. In the best way.',
    tags: ['Grip socks', 'Mat provided', 'Low impact'] },
  'mommy-me': { lines: ['Mommy', '& Me'], color: 'c-teal', effort: 1,
    vibe: 'Move with your little one. Chaos welcome, strollers too.',
    tags: ['Kids welcome', 'Stroller friendly'] },
  'muscle-mami': { lines: ['Muscle', 'Mami'], color: 'c-pink', effort: 4,
    vibe: 'The signature. Full body HIIT with the volume at eleven.',
    tags: ['Bring water', 'Towel', 'Brave face'] },
};

/* Weekly timetable keyed by JS weekday (0 = Sunday).
   Thu / Fri / Sat / Mon match the approved mockup; Tue / Wed are the same
   real classes in the studio's usual slots. Sunday is rest day. */
const WEEK_TEMPLATE = {
  0: 'rest',
  1: [
    { id: 'full-body-hiit', h: 6, m: 0, coach: 'Gabi', dur: 60 },
    { id: 'booty-abs', h: 17, m: 45, coach: 'Valeria', dur: 45 },
    { id: 'pilates-sculpt', h: 19, m: 0, coach: 'Kimber', dur: 50 },
  ],
  2: [
    { id: 'booty-abs', h: 6, m: 0, coach: 'Valeria', dur: 45 },
    { id: 'pilates-sculpt', h: 9, m: 30, coach: 'Kimber', dur: 50 },
    { id: 'muscle-mami', h: 17, m: 45, coach: 'Valeria', dur: 60 },
    { id: 'full-body-hiit', h: 19, m: 0, coach: 'Gabi', dur: 60 },
  ],
  3: [
    { id: 'arms-abs', h: 6, m: 0, coach: 'Bri', dur: 45 },
    { id: 'mommy-me', h: 12, m: 0, coach: 'Kimber', dur: 40 },
    { id: 'full-body-hiit', h: 17, m: 45, coach: 'Gabi', dur: 60 },
    { id: 'booty-abs', h: 19, m: 0, coach: 'Valeria', dur: 45 },
  ],
  4: [
    { id: 'booty-abs', h: 6, m: 0, coach: 'Valeria', dur: 45 },
    { id: 'pilates-sculpt', h: 9, m: 30, coach: 'Kimber', dur: 50 },
    { id: 'mommy-me', h: 12, m: 0, coach: 'Kimber', dur: 40 },
    { id: 'arms-abs', h: 16, m: 30, coach: 'Bri', dur: 45 },
    { id: 'muscle-mami', h: 17, m: 45, coach: 'Valeria', dur: 60 },
    { id: 'full-body-hiit', h: 19, m: 0, coach: 'Gabi', dur: 60 },
  ],
  5: [
    { id: 'full-body-hiit', h: 6, m: 0, coach: 'Gabi', dur: 60 },
    { id: 'booty-abs', h: 9, m: 30, coach: 'Valeria', dur: 45 },
    { id: 'pilates-sculpt', h: 12, m: 0, coach: 'Kimber', dur: 50 },
    { id: 'arms-abs', h: 17, m: 45, coach: 'Bri', dur: 45 },
    { id: 'muscle-mami', h: 19, m: 0, coach: 'Valeria', dur: 60 },
  ],
  6: [
    { id: 'muscle-mami', h: 8, m: 0, coach: 'Valeria', dur: 60 },
    { id: 'mommy-me', h: 9, m: 30, coach: 'Kimber', dur: 40 },
    { id: 'full-body-hiit', h: 11, m: 0, coach: 'Gabi', dur: 60 },
  ],
};

const COACHES = [
  { name: 'Valeria', role: 'Head Trainer & Studio Operations Manager', bio: 'Valeria is here to help you build the foundation for your healthiest self. With a background as a competitive dancer, she’s always found joy in movement, and that passion drives her teaching today.', tags: ['Core', 'Glutes', 'Personal training'] },
  { name: 'Gabi', role: 'Trainer', bio: 'Gabi is a former D1 athlete who’s always thrived on discipline, teamwork, and a healthy dose of competition. As a basketball player, strength and conditioning were fundamental to her performance on the court.', tags: ['Strength', 'Weightlifting', 'Hype'] },
  { name: 'Bri', role: 'Coach', bio: 'With experience training both adult and youth athletes, she specializes in functional movement, strength training, and helping members build confidence through effective and engaging workouts.', tags: ['Functional', 'Youth', 'Form'] },
  { name: 'Kimber', role: 'NASM Certified Personal Trainer & Group Fitness Instructor', bio: 'After becoming a mom, she found her passion in fitness, and now she thrives on providing a safe space for other women to fall in love with fitness and what their bodies are capable of.', tags: ['Confidence', 'Pilates', 'Moms'] },
];

/* Real pricing from bodiedsj.com */
// Plan ids are opaque/historical — NEVER rename: profile.plan stores them in members' localStorage.
const PLANS = [
  { id: 'trial', name: '7 days for $7', sub: 'Unlimited classes for a week', price: '$7', per: '', short: '7-day trial', badge: 'Start here' },
  { id: 'unlimited', name: 'Unlimited · month to month', sub: 'Every class, every week', price: '$215', per: '/mo', short: 'Unlimited' },
  { id: 'unlimited-6', name: '6 months unlimited', sub: 'Commit a little, save a little', price: '$199', per: '/mo', short: 'Unlimited · 6 mo' },
  { id: 'unlimited-12', name: '12 months unlimited', sub: 'Best value all year', price: '$184', per: '/mo', short: 'Unlimited · 12 mo' },
  { id: 'classes-10', name: 'Consistency Tier', sub: '8 classes/mo · for the regulars', price: '$150', per: '/mo', short: '8 classes/mo' },
  { id: 'classes-5', name: 'Flex Tier', sub: '4 classes/mo · ease into it', price: '$102', per: '/mo', short: '4 classes/mo' },
  { id: 'pack-20', name: '20-class pack', sub: '6 month expiry', price: '$479', per: '', short: '20-class pack' },
];
const PRICING_POLICY = 'All sales are final. Cancellations/pauses for recurring monthly memberships can be done by emailing us at hello@bodiedsj.com';

const CAPACITY = 12;
const MILESTONES = [1, 5, 10, 25, 50, 100];
