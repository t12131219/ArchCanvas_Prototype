"""Independent source regions with wrapped model inputs and a late cross-use."""
import torch
from torch import nn


class ManyInputs(nn.Module):
    def produce(self, seed, bias):
        left = torch.relu(seed)
        right = torch.sin(bias)
        extra = torch.cos(seed)
        return torch.tanh(left * right + extra)

    def receive(self, signal, gain, offset, context):
        early = torch.tanh(torch.cos(signal) * gain + offset)
        return torch.sigmoid(early + context)

    def forward(self, seed, signal, gain, offset, bias):
        context = self.produce(seed, bias)
        return self.receive(signal, gain, offset, context)


class InterruptedInputs(nn.Module):
    def produce(self, seed, bias):
        left = torch.relu(seed)
        right = torch.sin(bias)
        extra = torch.cos(seed)
        return torch.tanh(left * right + extra)

    def receive(self, signal, gain, offset, context):
        early = torch.tanh(external_unresolved(signal) * gain + offset)
        return torch.sigmoid(early + context)

    def forward(self, seed, signal, gain, offset, bias):
        context = self.produce(seed, bias)
        return self.receive(signal, gain, offset, context)
