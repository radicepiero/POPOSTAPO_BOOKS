import traceback

from sqlalchemy.orm import sessionmaker
from backend.database import engine
from backend.models import CopyEnrichmentJob, Work, Edition, EditionsWork, Copy, Author, Publisher
from backend.services.confirmation import confirm_copy_from_job

Session = sessionmaker(bind=engine)
db = Session()

JOB_ID = "154f8a19-bf08-4804-9476-d7840251674a"
COPY_ID = 3

try:
    job = db.query(CopyEnrichmentJob).filter_by(id=JOB_ID).first()
    if not job:
        print("Job non trovato")
        sys.exit(1)

    print("Job trovato. Risultato:")
    print(job.result)

    copy = confirm_copy_from_job(COPY_ID, JOB_ID, db)

    print("\nConferma riuscita:")
    print(f"  copy_id={copy.id}")
    print(f"  edition_id={copy.edition_id}")
    print(f"  status={copy.status}")

    edition = db.query(Edition).filter_by(id=copy.edition_id).first()
    ew = db.query(EditionsWork).filter_by(edition_id=edition.id).first() if edition else None
    work = db.query(Work).filter_by(id=ew.work_id).first() if ew else None
    print(f"  work_title={work.original_title if work else None}")
    print(f"  edition_title={edition.title if edition else None}")
    print(f"  authors={[a.given_name + ' ' + a.family_name for a in db.query(Author).all()]}")
    print(f"  publishers={[p.name for p in db.query(Publisher).all()]}")
except Exception:
    traceback.print_exc()
finally:
    db.close()
