from analyses.models import Analysis
import os

a = Analysis.objects.get(id=4)

print("annotated_video.name =", a.annotated_video.name)
print("annotated_video.url =", a.annotated_video.url if a.annotated_video else None)
print("annotated_video.path =", a.annotated_video.path if a.annotated_video else None)
print("exists =", os.path.exists(a.annotated_video.path) if a.annotated_video else None)