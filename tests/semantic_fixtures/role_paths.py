"""Unfamiliar source composition with separately implemented local stages."""
import math
import torch
from torch import nn


def pair_scores(a, b):
    return torch.matmul(a, b.transpose(-2, -1)) / math.sqrt(a.size(-1))


def normalize_weights(scores):
    weights = torch.softmax(scores, dim=-1)
    return torch.nan_to_num(weights, nan=0.0)


def weighted_values(weights, values):
    return torch.matmul(weights, values)


def combine_stages(a, b, c):
    scores = pair_scores(a, b)
    weights = normalize_weights(scores)
    return weighted_values(weights, c)


class WeaveCore(nn.Module):
    def __init__(self):
        super().__init__()
        self.parts = 2
        self.chunk = 4
        self.left = nn.Linear(8, 8)
        self.right = nn.Linear(8, 8)
        self.signal = nn.Linear(8, 8)
        self.finish = nn.Linear(8, 8)

    def divide(self, x):
        batch, length, _ = x.shape
        return x.view(batch, length, self.parts, self.chunk).transpose(1, 2).contiguous()

    def collect(self, x):
        batch, parts, length, chunk = x.shape
        return x.transpose(1, 2).contiguous().view(batch, length, parts * chunk)

    def forward(self, x, context, values):
        a = self.divide(self.left(x))
        b = self.divide(self.right(context))
        c = self.divide(self.signal(values))
        return self.finish(self.collect(combine_stages(a, b, c)))


class SeparateStages(nn.Module):
    def __init__(self):
        super().__init__()
        self.core = WeaveCore()
        self.tail = nn.Linear(8, 8)

    def forward(self, x, context):
        return self.tail(self.core(x, context, context))
