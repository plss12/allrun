-- The verses, quotes and chat phrases the widgets choose from (ADR 012). They are edited in the
-- dashboard; the app only reads them.
create table public.phrases (
  id text primary key default gen_random_uuid()::text,
  kind text not null check (kind in ('verse', 'quote', 'chat')),
  position integer not null,
  text_es text not null,
  text_en text not null,
  source_es text,
  source_en text,
  starts_on date,
  ends_on date,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint phrases_texts_not_blank check (btrim(text_es) <> '' and btrim(text_en) <> ''),
  constraint phrases_text_length check (
    char_length(text_es) <= case kind when 'chat' then 60 else 150 end
    and char_length(text_en) <= case kind when 'chat' then 60 else 150 end
  ),
  constraint phrases_source_by_kind check (
    case kind
      when 'chat' then source_es is null and source_en is null
      else btrim(coalesce(source_es, '')) <> '' and btrim(coalesce(source_en, '')) <> ''
    end
  ),
  constraint phrases_dates_in_order check (starts_on is null or ends_on is null or starts_on <= ends_on)
);

comment on table public.phrases is
  'Verses, quotes and chat phrases of the widgets. Turn a phrase off (active) instead of deleting it: saved designs may use it. Verses must come from public-domain translations (Reina-Valera 1909, World English Bible).';
comment on column public.phrases.position is
  'Its place in its list. Numbered by tens, to fit one in between.';
comment on column public.phrases.starts_on is
  'First day it shows in its list, by the phone''s date. Empty: from now on.';
comment on column public.phrases.ends_on is
  'Last day it shows in its list, included. With it, the phrase heads the list while in date.';

-- Its time of change, however the row is edited: how the app knows there is something new.
create function public.set_phrases_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function public.set_phrases_updated_at() from public, anon, authenticated;

create trigger phrases_set_updated_at
  before update on public.phrases
  for each row execute function public.set_phrases_updated_at();

-- Anyone can read, nobody can write through the API: only the dashboard does.
alter table public.phrases enable row level security;

revoke all on table public.phrases from anon, authenticated;
grant select on table public.phrases to anon, authenticated;

create policy "Anyone can read phrases"
  on public.phrases
  for select
  to anon, authenticated
  using (true);

-- The phrases the app shipped with, in the app's order, with the ids saved designs already use.
insert into public.phrases (id, kind, position, text_es, text_en, source_es, source_en) values
  ('philippians4v13', 'verse', 10, 'Todo lo puedo en Cristo que me fortalece.', 'I can do all things through Christ, who strengthens me.', 'Filipenses 4:13', 'Philippians 4:13'),
  ('romans8v18', 'verse', 20, 'Porque tengo por cierto que lo que en este tiempo se padece, no es de comparar con la gloria venidera que en nosotros ha de ser manifestada.', 'For I consider that the sufferings of this present time are not worthy to be compared with the glory which will be revealed toward us.', 'Romanos 8:18', 'Romans 8:18'),
  ('corinthians9v24', 'verse', 30, 'Corred de tal manera que lo obtengáis.', 'Run like that, that you may win.', '1 Corintios 9:24', '1 Corinthians 9:24'),
  ('hebrews12v1', 'verse', 40, 'Corramos con paciencia la carrera que nos es propuesta.', 'Let us run with perseverance the race that is set before us.', 'Hebreos 12:1', 'Hebrews 12:1'),
  ('isaiah40v31', 'verse', 50, 'Correrán, y no se cansarán; caminarán, y no se fatigarán.', 'They will run, and not be weary. They will walk, and not faint.', 'Isaías 40:31', 'Isaiah 40:31'),
  ('isaiah40v29', 'verse', 60, 'Él da esfuerzo al cansado, y multiplica las fuerzas al que no tiene ningunas.', 'He gives power to the weak. He increases the strength of him who has no might.', 'Isaías 40:29', 'Isaiah 40:29'),
  ('psalms18v33', 'verse', 70, 'Quien pone mis pies como pies de ciervas, e hízome estar sobre mis alturas.', 'He makes my feet like deer’s feet, and sets me on my high places.', 'Salmos 18:33', 'Psalms 18:33'),
  ('galatians6v9', 'verse', 80, 'No nos cansemos, pues, de hacer bien; que a su tiempo segaremos, si no hubiéremos desmayado.', 'Let us not be weary in doing good, for we will reap in due season, if we don’t give up.', 'Gálatas 6:9', 'Galatians 6:9'),
  ('timothy4v7', 'verse', 90, 'He peleado la buena batalla, he acabado la carrera, he guardado la fe.', 'I have fought the good fight. I have finished the course. I have kept the faith.', '2 Timoteo 4:7', '2 Timothy 4:7'),
  ('proverbs24v16', 'verse', 100, 'Siete veces cae el justo, y se torna a levantar.', 'A righteous man falls seven times, and rises up again.', 'Proverbios 24:16', 'Proverbs 24:16'),
  ('joshua1v9', 'verse', 110, 'Mira que te mando que te esfuerces y seas valiente: no temas ni desmayes.', 'Be strong and courageous. Don’t be afraid. Don’t be dismayed.', 'Josué 1:9', 'Joshua 1:9'),
  ('psalms28v7', 'verse', 120, 'Jehová es mi fortaleza y mi escudo: en él esperó mi corazón, y fui ayudado.', 'Yahweh is my strength and my shield. My heart has trusted in him, and I am helped.', 'Salmos 28:7', 'Psalms 28:7'),
  ('james1v12', 'verse', 130, 'Bienaventurado el varón que sufre la tentación; porque cuando fuere probado, recibirá la corona de vida.', 'Blessed is the man who endures temptation, for when he has been approved, he will receive the crown of life.', 'Santiago 1:12', 'James 1:12'),
  ('corinthians9v25', 'verse', 140, 'Todo aquel que lucha, de todo se abstiene.', 'Every man who strives in the games exercises self-control in all things.', '1 Corintios 9:25', '1 Corinthians 9:25'),
  ('psalms119v32', 'verse', 150, 'Por el camino de tus mandamientos correré, cuando ensanchares mi corazón.', 'I run in the path of your commandments, for you have set my heart free.', 'Salmos 119:32', 'Psalms 119:32'),
  ('deuteronomy31v6', 'verse', 160, 'Esforzaos y cobrad ánimo; no temáis, ni tengáis miedo.', 'Be strong and courageous. Don’t be afraid or scared.', 'Deuteronomio 31:6', 'Deuteronomy 31:6'),
  ('philippians3v13', 'verse', 170, 'Olvidando ciertamente lo que queda atrás, y extendiéndome a lo que está delante, prosigo al blanco.', 'Forgetting the things which are behind, and stretching forward to the things which are before, I press on toward the goal.', 'Filipenses 3:13-14', 'Philippians 3:13-14'),
  ('psalms60v12', 'verse', 180, 'En Dios haremos proezas.', 'Through God we shall do valiantly.', 'Salmos 60:12', 'Psalms 60:12'),
  ('romans5v3', 'verse', 190, 'La tribulación produce paciencia; y la paciencia, prueba; y la prueba, esperanza.', 'Suffering produces perseverance; and perseverance, proven character; and proven character, hope.', 'Romanos 5:3-4', 'Romans 5:3-4'),
  ('colossians3v23', 'verse', 200, 'Todo lo que hagáis, hacedlo de ánimo, como al Señor, y no a los hombres.', 'Whatever you do, work heartily, as for the Lord, and not for men.', 'Colosenses 3:23', 'Colossians 3:23'),
  ('kipchoge', 'quote', 10, 'Ningún ser humano tiene límites.', 'No human is limited.', 'Eliud Kipchoge', 'Eliud Kipchoge'),
  ('phelps', 'quote', 20, 'No puedes ponerle límite a nada. Cuanto más sueñas, más lejos llegas.', 'You can''t put a limit on anything. The more you dream, the farther you get.', 'Michael Phelps', 'Michael Phelps'),
  ('lemond', 'quote', 30, 'Nunca se vuelve más fácil, solo vas más rápido.', 'It never gets easier, you just go faster.', 'Greg LeMond', 'Greg LeMond'),
  ('zatopek', 'quote', 40, 'Si quieres correr, corre una milla. Si quieres experimentar una vida diferente, corre un maratón.', 'If you want to run, run a mile. If you want to experience a different life, run a marathon.', 'Emil Zátopek', 'Emil Zátopek'),
  ('prefontaine', 'quote', 50, 'Dar menos que lo mejor de ti es sacrificar el don.', 'To give anything less than your best is to sacrifice the gift.', 'Steve Prefontaine', 'Steve Prefontaine'),
  ('merckx', 'quote', 60, 'Pedalea tanto o tan poco, o tan largo o tan corto como sientas. Pero pedalea.', 'Ride as much or as little, or as long or as short as you feel. But ride.', 'Eddy Merckx', 'Eddy Merckx'),
  ('jordan', 'quote', 70, 'He fracasado una y otra y otra vez en mi vida. Y es por eso que tengo éxito.', 'I''ve failed over and over and over again in my life. And that is why I succeed.', 'Michael Jordan', 'Michael Jordan'),
  ('ali', 'quote', 80, 'Sufre ahora y vive el resto de tu vida como un campeón.', 'Suffer now and live the rest of your life as a champion.', 'Muhammad Ali', 'Muhammad Ali'),
  ('serenaWilliams', 'quote', 90, 'Un campeón no se define por sus victorias, sino por cómo puede recuperarse cuando cae.', 'A champion is defined not by their wins but by how they can recover when they fall.', 'Serena Williams', 'Serena Williams'),
  ('bolt', 'quote', 100, 'No pienso en los límites.', 'I don''t think limits.', 'Usain Bolt', 'Usain Bolt'),
  ('nyad', 'quote', 110, 'Nunca, jamás te rindas.', 'Never, ever give up.', 'Diana Nyad', 'Diana Nyad'),
  ('ashe', 'quote', 120, 'Empieza donde estás. Usa lo que tienes. Haz lo que puedas.', 'Start where you are. Use what you have. Do what you can.', 'Arthur Ashe', 'Arthur Ashe'),
  ('gretzky', 'quote', 130, 'Fallas el 100% de los tiros que no intentas.', 'You miss 100% of the shots you don''t take.', 'Wayne Gretzky', 'Wayne Gretzky'),
  ('billieJeanKing', 'quote', 140, 'Los campeones siguen jugando hasta que lo hacen bien.', 'Champions keep playing until they get it right.', 'Billie Jean King', 'Billie Jean King'),
  ('pele', 'quote', 150, 'El éxito no es un accidente. Es trabajo duro, perseverancia, aprendizaje, estudio y sacrificio.', 'Success is no accident. It is hard work, perseverance, learning, studying, sacrifice.', 'Pelé', 'Pelé'),
  ('owens', 'quote', 160, 'Para que los sueños se hagan realidad, se necesita muchísima determinación, dedicación, autodisciplina y esfuerzo.', 'In order to make dreams come into reality, it takes an awful lot of determination, dedication, self-discipline, and effort.', 'Jesse Owens', 'Jesse Owens'),
  ('nadal', 'quote', 170, 'Juego cada punto como si mi vida dependiera de ello.', 'I play each point like my life depends on it.', 'Rafael Nadal', 'Rafael Nadal'),
  ('kobe', 'quote', 180, 'Lo más importante es intentar inspirar a las personas para que puedan ser grandes en lo que quieran hacer.', 'The most important thing is to try and inspire people so that they can be great in whatever they want to do.', 'Kobe Bryant', 'Kobe Bryant'),
  ('biles', 'quote', 190, 'Prefiero arrepentirme de los riesgos que no funcionaron que de las oportunidades que no tomé en absoluto.', 'I''d rather regret the risks that didn''t work out than the chances I didn''t take at all.', 'Simone Biles', 'Simone Biles'),
  ('switzer', 'quote', 200, 'La vida es para participar, no para ser espectador.', 'Life is for participating, not for spectating.', 'Kathrine Switzer', 'Kathrine Switzer'),
  ('murakami', 'quote', 210, 'El dolor es inevitable. El sufrimiento es opcional.', 'Pain is inevitable. Suffering is optional.', 'Haruki Murakami', 'Haruki Murakami'),
  ('karnazes', 'quote', 220, 'Corre cuando puedas, camina si tienes que hacerlo, gatea si no queda otra; pero nunca te rindas.', 'Run when you can, walk if you have to, crawl if you must; just never give up.', 'Dean Karnazes', 'Dean Karnazes'),
  ('bingham', 'quote', 230, 'El milagro no es haber terminado. El milagro es haber tenido el valor de empezar.', 'The miracle isn''t that I finished. The miracle is that I had the courage to start.', 'John Bingham', 'John Bingham'),
  ('notke', 'quote', 240, 'El trabajo duro vence al talento cuando el talento no trabaja duro.', 'Hard work beats talent when talent doesn''t work hard.', 'Tim Notke', 'Tim Notke'),
  ('zombieMode', 'chat', 10, 'Modo zombie activado.', 'Zombie mode activated.', null, null),
  ('sweatOrTears', 'chat', 20, 'No sé si es sudor o mis lágrimas.', 'I don''t know if this is sweat or tears.', null, null),
  ('soulLeft', 'chat', 30, 'Mi alma abandonó mi cuerpo a la mitad.', 'My soul left my body halfway through.', null, null),
  ('stairsEnemy', 'chat', 40, 'Mañana las escaleras y yo somos enemigos mortales.', 'Tomorrow, stairs and I are mortal enemies.', null, null),
  ('survived', 'chat', 50, 'He sobrevivido, pero ¿a qué costo?', 'I survived, but at what cost?', null, null),
  ('whoToldMe', 'chat', 60, '¿Quién me mandaría a mí hacer esto?', 'Who talked me into doing this?', null, null),
  ('foodMotivation', 'chat', 70, 'Todo sea por la comida de después.', 'I only did this for the post-workout food.', null, null),
  ('crawling', 'chat', 80, 'Llegando a la ducha a gatas.', 'Crawling to the shower right now.', null, null),
  ('seemedGood', 'chat', 90, 'Parecía buena idea hace una hora.', 'It seemed like a good idea an hour ago.', null, null),
  ('jellyLegs', 'chat', 100, 'Oficialmente tengo piernas de gelatina.', 'My legs are officially made of jelly.', null, null),
  ('rebooting', 'chat', 110, 'Sistema reiniciando... por favor espere.', 'System rebooting... please wait.', null, null),
  ('couchCalling', 'chat', 120, 'El sofá me está llamando a gritos.', 'The couch is screaming my name.', null, null),
  ('fakeSmile', 'chat', 130, 'Esta sonrisa esconde mucho dolor muscular.', 'This smile hides a lot of muscle pain.', null, null),
  ('alienAbduction', 'chat', 140, 'Si me abducen ahora, que me lleven en brazos.', 'If aliens abduct me now, they better carry me.', null, null),
  ('endorphins', 'chat', 150, 'Las endorfinas están trabajando horas extra.', 'Endorphins are working overtime.', null, null),
  ('sleep2030', 'chat', 160, 'Me voy a dormir hasta el año 2030.', 'Going to sleep until the year 2030.', null, null),
  ('ghostedBreath', 'chat', 170, 'Mi propio aliento me ha dejado en visto.', 'My own breath ghosted me.', null, null),
  ('hungryBear', 'chat', 180, 'Hambre nivel: me comería la nevera entera.', 'Hunger level: I could eat the whole fridge.', null, null),
  ('willToLive', 'chat', 190, 'Buscando mis ganas de vivir por la ruta.', 'Searching for my will to live on the trail.', null, null),
  ('brainEmpty', 'chat', 200, 'Cerebro apagado, que decidan las piernas.', 'Brain empty, let the legs decide.', null, null),
  ('therapy', 'chat', 210, 'Más barato que el psicólogo.', 'Cheaper than therapy.', null, null),
  ('easyOne', 'chat', 220, 'Iba a ser un rodaje suave.', 'It was supposed to be an easy one.', null, null),
  ('coachProud', 'chat', 230, 'Mi entrenador estaría orgulloso.', 'My coach would be proud.', null, null),
  ('beforeCoffee', 'chat', 240, 'Hecho antes del café.', 'Done before coffee.', null, null);
